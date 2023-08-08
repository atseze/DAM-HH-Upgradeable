require("@nomicfoundation/hardhat-toolbox");
require("@openzeppelin/hardhat-upgrades");
require("hardhat/register");

module.exports = {
  solidity: "0.8.20",
  networks: {
    ganache: { url: "HTTP://127.0.0.1:7545" },
    localhost: {
      url: "http://localhost:8545",
      chainId: 1337,
    },
  },
};
