//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/Pausable.sol';
import '@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol';

import './interfaces/IStrategy.sol';
import './interfaces/IPool.sol';
import './interfaces/IRewardManager.sol';

import './Constants.sol';

abstract contract ZunamiPoolCompoundedController is
    ERC20,
    ERC20Permit,
    Pausable,
    AccessControlDefaultAdminRules
{
    using SafeERC20 for IERC20Metadata;

    uint256 public constant FEE_DENOMINATOR = 1000;
    uint256 public constant MAX_FEE = 300; // 30%

    uint8 public constant POOL_ASSETS = 5;

    uint256 public defaultDepositPid;
    uint256 public defaultWithdrawPid;

    uint256 public managementFee = 100; // 10%

    uint256 public feeTokenId;
    address public feeDistributor;

    uint256 public managementFees = 0;

    IRewardManager public rewardManager;

    IPool public pool;
    IERC20Metadata[] public rewardTokens;

    event ManagementFeeSet(uint256 oldManagementFee, uint256 newManagementFee);
    event FeeDistributorChanged(address oldFeeDistributor, address newFeeDistributor);
    event SetDefaultDepositPid(uint256 pid);
    event SetDefaultWithdrawPid(uint256 pid);
    event SetFeeTokenId(uint256 tid);
    event SetRewardManager(address rewardManager);
    event ClaimedManagementFee(address feeToken, uint256 feeValue);
    event AutoCompoundedAll(uint256 compoundedValue);
    event SetRewardTokens(IERC20Metadata[] rewardTokens);

    event Deposited(address indexed receiver, uint256 depositedValue, uint256 shares, uint256 pid);

    event Withdrawn(address indexed withdrawer, uint256 withdrawn, uint256 pid);

    constructor(
        address pool_,
        string memory name_,
        string memory symbol_
    )
        ERC20(name_, symbol_)
        ERC20Permit(name_)
        AccessControlDefaultAdminRules(24 hours, msg.sender)
    {
        require(pool_ != address(0), 'Zero pool');

        feeDistributor = msg.sender;

        pool = IPool(pool_);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function setRewardManager(address rewardManagerAddr) external onlyRole(DEFAULT_ADMIN_ROLE) {
        rewardManager = IRewardManager(rewardManagerAddr);
        emit SetRewardManager(rewardManagerAddr);
    }

    function setManagementFee(uint256 newManagementFee) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newManagementFee <= MAX_FEE, 'wrong fee');
        emit ManagementFeeSet(managementFee, newManagementFee);
        managementFee = newManagementFee;
    }

    function setDefaultDepositPid(uint256 _newPoolId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_newPoolId < pool.poolCount(), 'wrong pid');

        defaultDepositPid = _newPoolId;
        emit SetDefaultDepositPid(_newPoolId);
    }

    function setDefaultWithdrawPid(uint256 _newPoolId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_newPoolId < pool.poolCount(), 'wrong pid');

        defaultWithdrawPid = _newPoolId;
        emit SetDefaultWithdrawPid(_newPoolId);
    }

    function setFeeTokenId(uint256 _tokenId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(managementFees == 0, 'Withdraw fee');

        feeTokenId = _tokenId;
        emit SetFeeTokenId(_tokenId);
    }

    function setRewardTokens(
        IERC20Metadata[] memory rewardTokens_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        rewardTokens = rewardTokens_;
        emit SetRewardTokens(rewardTokens);
    }

    function changeFeeDistributor(address _feeDistributor) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit FeeDistributorChanged(feeDistributor, _feeDistributor);
        feeDistributor = _feeDistributor;
    }

    function claimManagementFee() external {
        IERC20Metadata feeToken_ = IERC20Metadata(Constants.USDC_ADDRESS);
        uint256 managementFees_ = managementFees;
        uint256 feeTokenBalance = feeToken_.balanceOf(address(this));
        uint256 transferBalance = managementFees_ > feeTokenBalance
            ? feeTokenBalance
            : managementFees_;
        if (transferBalance > 0) {
            feeToken_.safeTransfer(feeDistributor, transferBalance);
        }
        managementFees = 0;

        emit ClaimedManagementFee(Constants.USDC_ADDRESS, transferBalance);
    }

    function autoCompoundAll() external {
        pool.claimRewards(address(this), rewardTokens);

        sellRewards();

        uint256[POOL_ASSETS] memory amounts;
        amounts[feeTokenId] = pool.tokens()[feeTokenId].balanceOf(address(this)) - managementFees;
        uint256 depositedValue = pool.deposit(defaultDepositPid, amounts, address(this));

        emit AutoCompoundedAll(depositedValue);
    }

    function sellRewards() internal virtual {
        uint256 rewardsLength_ = rewardTokens.length;
        uint256[] memory rewardBalances = new uint256[](rewardsLength_);
        bool allRewardsEmpty = true;

        for (uint256 i = 0; i < rewardsLength_; i++) {
            rewardBalances[i] = rewardTokens[i].balanceOf(address(this));
            if (rewardBalances[i] > 0) {
                allRewardsEmpty = false;
            }
        }
        if (allRewardsEmpty) {
            return;
        }

        IERC20Metadata feeToken_ = pool.tokens()[feeTokenId];
        uint256 feeTokenBalanceBefore = feeToken_.balanceOf(address(this));

        IRewardManager rewardManager_ = rewardManager;
        IERC20Metadata rewardToken_;
        for (uint256 i = 0; i < rewardsLength_; i++) {
            if (rewardBalances[i] == 0) continue;
            rewardToken_ = rewardTokens[i];
            rewardToken_.transfer(address(rewardManager_), rewardBalances[i]);
            rewardManager_.handle(address(rewardToken_), rewardBalances[i], address(feeToken_));
        }

        uint256 feeTokenBalanceAfter = feeToken_.balanceOf(address(this));

        managementFees += calcManagementFee(feeTokenBalanceAfter - feeTokenBalanceBefore);
    }

    function calcManagementFee(uint256 amount) internal view returns (uint256) {
        return (amount * managementFee) / FEE_DENOMINATOR;
    }

    function tokenPrice() public view returns (uint256) {
        return calcTokenPrice(pool.totalHoldings(), totalSupply());
    }

    function calcTokenPrice(uint256 _holdings, uint256 _tokens) public pure returns (uint256) {
        return (_holdings * 1e18) / _tokens;
    }

    function deposit(
        uint256[POOL_ASSETS] memory amounts,
        address receiver
    ) external whenNotPaused returns (uint256 shares) {
        if (receiver == address(0)) {
            receiver = _msgSender();
        }

        uint256 stableBefore = pool.balanceOf(address(this));

        for (uint256 i = 0; i < amounts.length; i++) {
            if (amounts[i] > 0) {
                IERC20Metadata(pool.tokens()[i]).safeTransferFrom(
                    _msgSender(),
                    address(pool),
                    amounts[i]
                );
            }
        }

        uint256 depositedValue = pool.deposit(defaultDepositPid, amounts, address(this));

        if (totalSupply() == 0) {
            shares = depositedValue;
        } else {
            shares = (totalSupply() * depositedValue) / stableBefore;
        }

        emit Deposited(receiver, depositedValue, shares, defaultDepositPid);
        _mint(receiver, shares);
    }

    function withdraw(
        uint256 shares,
        uint256[POOL_ASSETS] memory minTokenAmounts,
        address receiver
    ) external whenNotPaused {
        uint256 withdrawAmount = (pool.balanceOf(address(this)) * shares) / totalSupply();
        IERC20Metadata(address(pool)).safeIncreaseAllowance(address(pool), withdrawAmount);
        pool.withdraw(defaultWithdrawPid, withdrawAmount, minTokenAmounts, receiver);
    }

    function withdrawStuckToken(IERC20Metadata _token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 tokenBalance = _token.balanceOf(address(this));
        if (tokenBalance > 0) {
            _token.safeTransfer(_msgSender(), tokenBalance);
        }
    }
}
