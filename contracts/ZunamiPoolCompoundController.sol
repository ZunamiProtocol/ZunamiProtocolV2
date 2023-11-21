//SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol';
import '@openzeppelin/contracts/utils/Pausable.sol';
import '@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';

import './interfaces/IPool.sol';
import './interfaces/IRewardManager.sol';
import './ZunamiPoolControllerBase.sol';

contract ZunamiPoolCompoundController is ERC20, ERC20Permit, ZunamiPoolControllerBase {
    using SafeERC20 for IERC20;

    error WrongFee();
    error FeeMustBeWithdrawn();

    uint256 public constant PRICE_MULTIPLIER = 1e18;
    uint256 public constant FEE_DENOMINATOR = 1000;
    uint256 public constant MAX_FEE = 300; // 30%

    uint256 public managementFeePercent = 100; // 10%

    uint256 public feeTokenId;
    address public feeDistributor;

    uint256 public collectedManagementFee = 0;

    IRewardManager public rewardManager;

    event ManagementFeePercentSet(uint256 oldManagementFee, uint256 newManagementFee);
    event FeeDistributorChanged(address oldFeeDistributor, address newFeeDistributor);
    event SetFeeTokenId(uint256 tid);
    event SetRewardManager(address rewardManager);
    event ClaimedManagementFee(address feeToken, uint256 feeValue);
    event AutoCompoundedAll(uint256 compoundedValue);
    event Deposited(address indexed receiver, uint256 assets, uint256 shares, uint256 sid);
    event Withdrawn(address indexed withdrawer, uint256 shares, uint256 assets, uint256 sid);

    constructor(
        address pool_,
        string memory name_,
        string memory symbol_
    ) ERC20(name_, symbol_) ERC20Permit(name_) ZunamiPoolControllerBase(pool_) {
        feeDistributor = msg.sender;
    }

    function setRewardManager(address rewardManagerAddr) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (rewardManagerAddr == address(0)) revert ZeroAddress();

        rewardManager = IRewardManager(rewardManagerAddr);
        emit SetRewardManager(rewardManagerAddr);
    }

    function setManagementFeePercent(
        uint256 newManagementFeePercent
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newManagementFeePercent > MAX_FEE) revert WrongFee();
        emit ManagementFeePercentSet(managementFeePercent, newManagementFeePercent);
        managementFeePercent = newManagementFeePercent;
    }

    function setFeeTokenId(uint256 _tokenId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (collectedManagementFee != 0) revert FeeMustBeWithdrawn();

        feeTokenId = _tokenId;
        emit SetFeeTokenId(_tokenId);
    }

    function changeFeeDistributor(address _feeDistributor) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit FeeDistributorChanged(feeDistributor, _feeDistributor);
        feeDistributor = _feeDistributor;
    }

    function claimManagementFee() external nonReentrant {
        IERC20 feeToken_ = IERC20(pool.tokens()[feeTokenId]);
        uint256 collectedManagementFee_ = collectedManagementFee;
        uint256 feeTokenBalance = feeToken_.balanceOf(address(this));
        uint256 transferBalance = collectedManagementFee_ > feeTokenBalance
            ? feeTokenBalance
            : collectedManagementFee_;
        if (transferBalance > 0) {
            feeToken_.safeTransfer(feeDistributor, transferBalance);
        }
        collectedManagementFee = 0;

        emit ClaimedManagementFee(address(feeToken_), transferBalance);
    }

    function autoCompoundAll() external whenNotPaused nonReentrant {
        claimPoolRewards(address(this));

        sellRewards();

        IERC20 feeToken = pool.tokens()[feeTokenId];
        uint256[POOL_ASSETS] memory amounts;
        amounts[feeTokenId] = feeToken.balanceOf(address(this)) - collectedManagementFee;
        feeToken.safeTransfer(address(pool), amounts[feeTokenId]);

        uint256 depositedValue = pool.deposit(defaultDepositSid, amounts, address(this));

        emit AutoCompoundedAll(depositedValue);
    }

    function sellRewards() internal virtual {
        uint256 received = _sellRewards(rewardManager, pool.tokens()[feeTokenId]);
        collectedManagementFee += calcManagementFee(received);
    }

    function calcManagementFee(uint256 amount) internal view returns (uint256) {
        return (amount * managementFeePercent) / FEE_DENOMINATOR;
    }

    function tokenPrice() public view returns (uint256) {
        return calcTokenPrice(pool.totalHoldings(), totalSupply());
    }

    function calcTokenPrice(uint256 _holdings, uint256 _tokens) public pure returns (uint256) {
        return (_holdings * PRICE_MULTIPLIER) / _tokens;
    }

    function depositPool(
        uint256[POOL_ASSETS] memory amounts,
        address receiver
    ) internal override returns (uint256 shares) {
        uint256 stableBefore = pool.balanceOf(address(this));

        uint256 assets = depositDefaultPool(amounts, address(this));

        if (totalSupply() == 0) {
            shares = assets;
        } else {
            shares = (totalSupply() * assets) / stableBefore;
        }

        _mint(receiver, shares);
        emit Deposited(receiver, assets, shares, defaultDepositSid);
    }

    function withdrawPool(
        address user,
        uint256 shares,
        uint256[POOL_ASSETS] memory minTokenAmounts,
        address receiver
    ) internal override {
        uint256 assets = (pool.balanceOf(address(this)) * shares) / totalSupply();
        withdrawDefaultPool(assets, minTokenAmounts, receiver);
        _burn(user, shares);
        emit Withdrawn(user, shares, assets, defaultWithdrawSid);
    }
}
