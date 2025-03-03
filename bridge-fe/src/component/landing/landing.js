"use client";
import React, { useEffect, useState } from 'react'
import { parseUnits } from 'viem'
import { MaxUint256 } from "ethers";
import Image from 'next/image';
import { useAccount, useBalance, useDisconnect, useReadContract, useSwitchChain, useTransactionReceipt, useWriteContract } from 'wagmi';
import Header from '../header/header';
import WalletModal from './../walletmodal/walletmodal';
import TokenModal from './../tokenmodal/tokenmodal';
import GasModal from './../gasmodal/gasmodal';
import SlippageModal from './../slippagemodal/slippagemodal';
import { BridgeIcon, DropDownIcon, LoadingIcon, SwapIcon } from '@/assets';
import { ABIS, CONTRACT_ADDRESSES } from '@/contract/addresses';
import { useTheme } from '@/theme/ThemeProvider';
import { useToast } from '@/hooks/ToastProvider';
export default function Landing() {

  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState({ type: 'networkPay' });
  const [showGasModal, setShowGasModal] = useState(false);
  const [showSlippageModal, setShowSlippageModal] = useState(false);
  const [err, setErr] = useState(null)
  const [value, setValue] = useState(0)
  const [loader, setLoader] = useState(false);
  const [call, setCall] = useState(false);
  const [selectedData, setSelectedData] = useState({
    networkPay: null,
    networkReceive: null,
    tokenPay: null,
    tokenReceive: null,
    addressPay: null,
    addressReceive: null,
    networkPayImage: null,
    networkReceiveImage: null,
    tokenPayImage: null,
    tokenReceiveImage: null,
    tokenPayName: null,
    tokenReceiveName: null,
    chainIdPay: null,
    chainIdReceive: null
  })

  const { isConnected, address: wallet_address, connector } = useAccount();
  const { theme, toggleTheme } = useTheme();
  const { switchChain } = useSwitchChain();
  const { disconnect } = useDisconnect();
  const showToast = useToast();
  const { data: currentBalancePay, refetch } = useBalance({ address: wallet_address, token: selectedData?.addressPay, watch: true, chainId: selectedData?.chainIdPay });
  const { data: currentBalanceReceive, refetch: refetch2 } = useBalance({ address: wallet_address, token: selectedData?.addressReceive, watch: true, chainId: selectedData?.chainIdReceive });

  const FINAL_ADDRESS = ((selectedData?.tokenPayName === 'WOW' && selectedData?.tokenReceiveName === 'WWow') || (selectedData?.tokenPayName === 'WJU' && selectedData?.tokenReceiveName === 'JU')) ? CONTRACT_ADDRESSES.bsc.BSC_BRIDGE
    : ((selectedData?.tokenPayName === 'WWow' && selectedData?.tokenReceiveName === 'WOW') || (selectedData?.tokenPayName === 'JU' && selectedData?.tokenReceiveName === 'WJU')) ? CONTRACT_ADDRESSES?.juchain?.JU_BRIDGE
      : ''

  // console.log(selectedData, FINAL_ADDRESS, selectedData?.tokenPayName , 'WOW' , selectedData?.tokenReceiveName , 'WWow')
  const { writeContract, isLoading, isSuccess, isError, error: writeError, data: writeData, isPaused, isPending, isIdle } = useWriteContract();
  const { data: allowancevalue, refetch: refetchAllowance } = useReadContract({
    abi: ABIS.APPROVE_TOKEN,
    address: selectedData?.addressPay,
    functionName: 'allowance',
    args: [wallet_address, FINAL_ADDRESS]
  })

  const switchNetworkWalletConnect = () => {
    switchChain({ chainId: selectedData?.networkPay === 'BNB Mainnet' ? 97 : 66633666 });
  }

  useEffect(() => {
    if (wallet_address && selectedData?.networkPay) {
      switchNetworkWalletConnect()
    }
  }, [wallet_address, selectedData])

  const {
    data: receipt,
    isLoading: isConfirming,
    isSuccess: isConfirmed,
  } = useTransactionReceipt({
    hash: writeData,
  });

  // console.log(isConfirming, loader, writeData, isSuccess, writeError)

  useEffect(() => {
    // if (!allowancevalue && !parseInt(allowancevalue?.toString())) {
    Promise.all([refetchAllowance()])
      .then(([]) => {
        console.log('Allownce successfully!');
      });
    // }
  }, [allowancevalue, call])

  useEffect(() => {
    if (writeData && isConfirmed && loader && call) {
      const formattedValue = parseUnits(value?.toString(), 18);
      writeContract({
        abi: ABIS.BSC_BRIDGE_TWO_WAY,
        address: CONTRACT_ADDRESSES.bsc.BSC_BRIDGE,
        functionName: 'lockWow',
        args: [formattedValue],
      })
      setCall(false);
    } else if (isError && loader && !isPending) {
      setLoader(false);
      setCall(false);
      showToast(writeError?.shortMessage ? writeError?.shortMessage : "Transaction Failed!", 'error')
    }
    if (isConfirmed && writeData && value && loader && !call) {
      showToast('Tokens purchased successfully!', 'success')
      setLoader(false);
      setValue(0)
    }
    refetch();

    let count = 0;
    const interval = setInterval(() => {
      if (count < 5) {
        refetch();
        count++;
      } else {
        clearInterval(interval);
      }
    }, 100000);

    // Call refetch2 after 10 seconds
    const timeout = setTimeout(() => {
      refetch2();
    }, 10000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [isConfirming, loader, writeData, isSuccess, isError, writeError, isPending, call])


  const handleSwap = () => {
    setSelectedData((prev) => ({
      networkPay: prev.networkReceive,
      networkReceive: prev.networkPay,
      tokenPay: prev.tokenReceive,
      tokenReceive: prev.tokenPay,
      addressPay: prev?.addressReceive,
      addressReceive: prev?.addressPay,
      networkPayImage: prev?.networkReceiveImage,
      networkReceiveImage: prev?.networkPayImage,
      tokenPayImage: prev?.tokenReceiveImage,
      tokenReceiveImage: prev?.tokenPayImage,
      tokenPayName: prev?.tokenReceiveName,
      tokenReceiveName: prev?.tokenPayName,
      chainIdPay: prev?.chainIdReceive,
      chainIdReceive: prev?.chainIdPay
    }));
  };

  const handleTrade = () => {
    const formattedValue = parseUnits(value?.toString(), 18);
    setLoader(true);
    const allowanceUpdate = allowancevalue?.toString() ? Number(allowancevalue?.toString()) / 1e18 : 0;
    // console.log(allowanceUpdate, allowancevalue, parseInt(formattedValue), selectedData?.tokenPayName, selectedData?.addressPay, FINAL_ADDRESS)
    if ((allowanceUpdate < parseInt(formattedValue) && selectedData?.tokenPayName !== 'JU')) {
      writeContract({
        abi: ABIS.APPROVE_TOKEN,
        address: selectedData?.addressPay,
        functionName: 'approve',
        args: [FINAL_ADDRESS, MaxUint256],
      })
      setCall(true);
    } else if (allowanceUpdate > parseInt(formattedValue) || selectedData?.tokenPayName === 'JU') {
      const FINAL_ABI = (selectedData?.tokenPayName === 'WOW' && selectedData?.tokenReceiveName === 'WWow' || selectedData?.tokenPayName === 'WJU' && selectedData?.tokenReceiveName === 'JU') ? ABIS.BSC_BRIDGE_TWO_WAY
        : (selectedData?.tokenPayName === 'WWow' && selectedData?.tokenReceiveName === 'WOW' || selectedData?.tokenPayName === 'JU' && selectedData?.tokenReceiveName === 'WJU') ? ABIS.JU_BRIDGE_TWO_WAY
          : ''
      const FINAL_FUNC = selectedData?.tokenPayName === 'WOW' && selectedData?.tokenReceiveName === 'WWow' ? "lockWow"
        : selectedData?.tokenPayName === 'WWow' && selectedData?.tokenReceiveName === 'WOW' ? 'burnWwow'
          : selectedData?.tokenPayName === 'JU' && selectedData?.tokenReceiveName === 'WJU' ? 'lockJuCoin'
            : selectedData?.tokenPayName === 'WJU' && selectedData?.tokenReceiveName === 'JU' ? 'burnWju' : ''
      // console.log("FINAL_FUNC",FINAL_ADDRESS, FINAL_FUNC)
      if (selectedData?.tokenPayName === 'JU') {
        writeContract({
          abi: FINAL_ABI,
          address: FINAL_ADDRESS,
          functionName: FINAL_FUNC,
          // args: [formattedValue],
          value: formattedValue
        })
      } else {
        writeContract({
          abi: FINAL_ABI,
          address: FINAL_ADDRESS,
          functionName: FINAL_FUNC,
          args: [formattedValue],
        })
      }
      // console.log(FINAL_ADDRESS, FINAL_FUNC)
    }
  }

  useEffect(() => {
    handleValidation()
  }, [value, currentBalancePay])

  const handleValidation = () => {
    if (selectedData?.networkPay) {
      if (Number(value) > 0 && parseFloat(currentBalancePay?.formatted) < parseFloat(value)) {
        setErr('You have an insufficient balance.')
      } else {
        setErr(null)
      }
    }
  }

  return (
    <React.Fragment>
      {showWalletModal && (<WalletModal setShowWalletModal={setShowWalletModal} />)}
      {showTokenModal?.type && (<TokenModal
        setShowTokenModal={setShowTokenModal}
        setSelectedData={setSelectedData}
        selectedData={selectedData}
        showTokenModal={showTokenModal?.type}
      />)}
      {showGasModal && (<GasModal setShowGasModal={setShowGasModal} />)}
      {showSlippageModal && (<SlippageModal setShowSlippageModal={setShowSlippageModal} />)}
      {/* Header Section Starts Here */}
      <Header
        setShowWalletModal={setShowWalletModal}
        isConnected={isConnected}
        address={wallet_address}
        disconnect={disconnect}
        connector={connector}
      />

      {/* Header Section Ends Here */}

      {/* Main Section Starts Here */}
      <main className={`${theme === "light" ? "light-wrapper" : ""
        } w-[95%] md:w-[550px] mx-auto py-10`}>
        <div className={` ${theme === "light" ? "bg-lightcard-gradient" : "bg-mine-gradient"
          } main-wrapper backdrop-blur-2xl rounded-xl shadow-pump p-4`}>
          <section className={` ${theme === "light" ? "bg-light shadow-custom border-lightbg" : "bg-[#142d32]"
            } upper-network p-4 rounded-2xl border-[.3px]`}>
            <div className='flex justify-between items-center'>
              <p className={`${theme === "light" ? "text-lightgreen" : "text-white"
                } text-base font-semibold mb-2 ml-1 text-left`}>You pay</p>
              {/* <p className='text-base text-gray-400 mb-2 ml-1 text-right'>Balance: <span>{isConnected && Number(currentBalancePay?.formatted) > 0 && selectedData?.networkPay ? Number(currentBalancePay?.formatted)?.toFixed(2) : isConnected && currentBalancePay?.formatted && selectedData?.networkPay ? Number(currentBalancePay?.formatted) : '0'} {selectedData?.tokenPayName}</span></p> */}
            </div>
            <div className={`${theme === "light" ? "border-lightbg" : "border-gray-400"
              } border rounded-2xl`}>
              <div className={`${theme === "light" ? "bg-lightbg" : "bg-coin-gradient"
                } grid items-center rounded-t-2xl`}>
                <button onClick={() => setShowTokenModal({ type: "networkPay" })} className='px-4 py-1 flex items-center border-r rounded-t-2xl border-gray-700 hover:bg-hover-gradient'>
                  <div className={`relative h-8 ${(selectedData?.tokenPayImage || selectedData?.networkPayImage) ? 'mr-4 w-8' : ''}`}>
                    {selectedData?.tokenPayImage &&
                      <img
                        src={selectedData?.tokenPayImage}
                        className="w-8 h-8 rounded-full"
                        alt="Token"
                      />}

                    {selectedData?.networkPayImage &&
                      <img
                        src={selectedData?.networkPayImage}
                        className="absolute top-0 right-0 w-4 h-4 rounded-full border-2 border-black"
                        alt="Network Badge"
                      />}
                  </div>
                  <div>
                    { }
                    <div className='flex gap-2 items-center'>
                      <div className='text-sm font-semibold'>{selectedData?.tokenPay ? selectedData?.tokenPay : "Token Select"}</div>
                      <DropDownIcon />
                    </div>
                  </div>
                </button>
              </div>

              <div className='px-4 py-3 grid grid-cols-[auto_50px_auto] gap-x-4'>
                <input value={value} type='number' name="value" onChange={(e) => setValue(e?.target?.value)} className={`${theme === "light" ? "text-lightgreen" : "bg-transparent"
                  } font-semibold bg-transparent w-full block border-0 outline-none focus:outline-none`} placeholder='0' />
                <button onClick={() => setValue(currentBalancePay?.formatted)} className='rounded-md text-xs p-1 mr-[-15px] bg-hover-gradient hover:bg-primary-gradient'>
                  Max
                </button>
                <div className={` ${theme === "light" ? "border-lightbg" : "border-white"
                  } text-end border-l pl-4 ml-4`}>
                  <p className={`${theme === "light" ? "text-lightgreen" : "text-wow"
                    } font-semibold text-xs`}>Balance</p>
                  <p className={`${theme === "light" ? "text-lightgreen" : "text-wow"
                    } font-semibold text-xs`}>{isConnected && Number(currentBalancePay?.formatted) > 0 && selectedData?.networkPay ? Number(currentBalancePay?.formatted)?.toFixed(2) : isConnected && currentBalancePay?.formatted && selectedData?.networkPay ? Number(currentBalancePay?.formatted) : '0'} {selectedData?.tokenPayName}</p>
                </div>
              </div>
            </div>
          </section>

          <div className='flex justify-center my-5'>
            <button onClick={handleSwap} className='rounded-full p-2 bg-mine-gradient hover:bg-hover-gradient flex justify-center items-center hover:shadow-pump shadow-custom w-10 h-10'>
              <SwapIcon />
            </button>
          </div>

          <section className={` ${theme === "light" ? "bg-light shadow-custom border-lightbg" : "bg-[#142d32]"
            } lower-network p-4 rounded-2xl border-[.3px] mb-7`}>
            <div className='flex justify-between items-center'>
              <p className={`${theme === "light" ? "text-lightgreen" : "text-white"
                } font-semibold text-base mb-2 ml-1 text-left`}>You receive</p>
              {/* <p className='text-base text-gray-400 mb-2 ml-1 text-right'>Balance: <span>{isConnected && Number(currentBalanceReceive?.formatted) > 0 && selectedData?.networkReceive ? Number(currentBalanceReceive?.formatted)?.toFixed(2) : isConnected && currentBalanceReceive?.formatted && selectedData?.networkReceive ? Number(currentBalanceReceive?.formatted) : '0'} {selectedData?.tokenReceiveName}</span></p> */}
            </div>
            <div className={`${theme === "light" ? "border-lightbg" : "border-gray-400"
              } border rounded-2xl`}>
              <div className={`${theme === "light" ? "bg-lightbg" : "bg-coin-gradient"
                } grid items-center rounded-t-2xl`}>
                <button onClick={() => setShowTokenModal({ type: "networkReceive" })} className='px-4 py-1 flex items-center border-r rounded-t-2xl border-gray-700 hover:bg-hover-gradient'>
                  {/* {(selectedData?.tokenReceiveImage || selectedData?.networkReceiveImage) && */}
                  <div className={`relative h-8 ${(selectedData?.tokenReceiveImage || selectedData?.networkReceiveImage) ? 'mr-4 w-8' : ''}`}>
                    {selectedData?.tokenReceiveImage &&
                      <img
                        src={selectedData?.tokenReceiveImage}
                        className="w-8 h-8 rounded-full"
                        alt="Token"
                      />}

                    {selectedData?.networkReceiveImage && <img
                      src={selectedData?.networkReceiveImage}
                      className="absolute top-0 right-0 w-4 h-4 rounded-full border-2 border-black"
                      alt="Network Badge"
                    />}
                  </div>
                  {/* } */}
                  <div>
                    {/* <p className='text-xs text-left'>Token</p> */}
                    <div className='flex gap-2 items-center'>
                      <div className='text-sm font-semibold'>{selectedData?.tokenReceive ? selectedData?.tokenReceive : "Token Select"}</div>
                      <DropDownIcon />
                    </div>
                  </div>
                </button>
              </div>

              <div className='px-4 py-3 grid grid-cols-60-40 gap-x-4'>
                <div className={` ${theme === "light" ? "text-lightgreen" : "text-white"
                  } font-semibold text-base whitespace-nowrap overflow-hidden text-ellipsis`}>{value ? value : '-'}</div>

                <div className='text-end mr-4'>
                  <div className='flex gap-2 items-center justify-end'>
                    <button href={''} className={`${theme === "light" ? "text-lightgreen" : "text-wow"
                      } font-semibold text-xs`}>Balance</button>
                  </div>
                  {/* <p className={`${theme === "light" ? "text-lightgreen" : "text-wow"
                    } text-xs overflow-hidden text-ellipsis`}>--</p> */}
                  <p className={`${theme === "light" ? "text-lightgreen" : "text-wow"
                    } uppercase font-semibold text-xs`}>{isConnected && Number(currentBalanceReceive?.formatted) > 0 && selectedData?.networkReceive ? Number(currentBalanceReceive?.formatted)?.toFixed(2) : isConnected && currentBalanceReceive?.formatted && selectedData?.networkReceive ? Number(currentBalanceReceive?.formatted) : '0'} {selectedData?.tokenReceiveName}</p>
                </div>
              </div>
            </div>
          </section>
          {(loader && isConnected) &&
            <section className={`${theme === "light" ? "bg-light border-lightbg shadow-xl" : "bg-[#142d32]"} bridge p-4 rounded-2xl border-[.3px] mb-7`}>
              <div className='flex justify-between items-center'>
                <div className='flex gap-2 items-center'>
                  <p className={` ${theme === "light" ? "text-lightgreen" : "text-white"} font-semibold text-sm uppercase`}>{selectedData?.networkPay}</p>
                  <Image width={100} height={100} src={selectedData?.networkPayImage || '/images/logo.svg'} className='w-4 rounded-full' alt='Media' />
                </div>

                <div className='flex gap-2 items-center'>
                  <p className={` ${theme === "light" ? "text-lightgreen" : "text-white"} text-sm font-semibold uppercase`}>{selectedData?.networkReceive}</p>
                  <Image width={100} height={100} src={selectedData?.networkReceiveImage || '/images/bnb.svg'} className='w-4 rounded-full' alt='Media' />
                </div>
              </div>

              <div className='py-2 rounded-lg'>
                <div className={`${theme === "light" ? "bg-lightbg" : "bg-[#153941]"} grid grid-cols-[1fr_40px_1fr] rounded-xl p-3 justify-between gap-2 items-center`}>
                  <div className='grid grid-cols-[auto_1fr] gap-2 items-center'>
                    <div className='flex gap-2 items-center'>
                      <Image width={100} height={100} src={selectedData?.tokenPayImage || '/images/logo.svg'} className='w-4 rounded-full' alt='Media' />
                      <p className='text-xs font-semibold text-white uppercase whitespace-nowrap'>{value} {selectedData?.tokenPayName}</p>
                    </div>
                    <div className="arrow-5"></div>
                  </div>

                  {/* <div className="loader">
                  <span />
                </div> */}
                  <BridgeIcon />

                  <div className='grid grid-cols-[1fr_auto] gap-2 items-center'>
                    <div className="arrow-5"></div>
                    <div className='flex gap-2 items-center justify-end'>
                      <Image width={100} height={100} src={selectedData?.tokenReceiveImage || '/images/bnb.svg'} className='w-4 rounded-full' alt='Media' />
                      <p className='text-xs font-semibold text-white uppercase whitespace-nowrap'>{value} {selectedData?.tokenReceiveName}</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          }

          <div className='flex flex-col gap-3 mb-7'>
            <div className='flex justify-between text-xs items-center'>
              <div className={`${theme === "light" ? "text-lightgreen" : "text-white"} font-semibold`}>You will receive</div>
              <div className={`${theme === "light" ? "text-lightgreen" : "text-white"} font-semibold`}>{value ? value + " " + selectedData?.tokenReceive : "--"}</div>
            </div>

            <div className='flex justify-between text-xs items-center'>
              <div></div>
              <div className={`${theme === "light" ? "text-lightgreen" : "text-white"} font-semibold`}>ETA: {"<"} 2 min</div>
            </div>
          </div>
          {err && <p className='text-xs mb-2 text-[#ff2c2c] '>{err}</p>}

          {isConnected ?
            <>
              <button disabled={err || loader || value <= 0 || selectedData?.networkPay === null} onClick={() => handleTrade()} className={`w-full rounded-[10px] p-3 ${err || value <= 0 || selectedData?.networkPay === null ? 'bg-smooth' : 'bg-[#076d55]'}`}>
                {loader ? <LoadingIcon /> : "Confirm Trade"}
              </button>
              {/* <button onClick={() => disconnect()} className={`w-full rounded-[10px] p-3 bg-[#076d55] mt-3`}>
                Disconnect
              </button> */}
            </> :
            <button onClick={() => setShowWalletModal(true)} className={`${theme === "light" ? "bg-mine-gradient" : "bg-coin-gradient"
              } hover:bg-primary-gradient w-full rounded-[10px] p-3`}>
              Connect Wallet
            </button>
          }
        </div>
      </main>
    </React.Fragment >
  )
}
