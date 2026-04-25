# @version ^0.4.0
# Standard ERC-20 interface — used by PaymentChannel, AgentEscrow, SpendingLimiter.

@external
def transfer(_to: address, _value: uint256) -> bool:
    ...

@external
def transferFrom(_from: address, _to: address, _value: uint256) -> bool:
    ...

@external
def approve(_spender: address, _value: uint256) -> bool:
    ...

@external
@view
def allowance(_owner: address, _spender: address) -> uint256:
    ...

@external
@view
def balanceOf(_owner: address) -> uint256:
    ...

@external
@view
def decimals() -> uint8:
    ...
