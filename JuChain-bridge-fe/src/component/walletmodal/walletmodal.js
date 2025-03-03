"use client";
import React, { useEffect } from 'react';
import { ConnectButton, WalletButton } from "@rainbow-me/rainbowkit";
import { useConnect, useAccount } from "wagmi";
import Link from 'next/link';
import Image from 'next/image';
import { CloseIcon } from '@/assets';
import { useTheme } from '@/theme/ThemeProvider';

export default function WalletModal({ setShowWalletModal }) {
  const { connect, connectors } = useConnect();
  const { isConnected } = useAccount();
  const { theme, toggleTheme } = useTheme();
  const handleConnect = async (connector) => {
    await connect({ connector });
    setShowWalletModal(false)
  };
  useEffect(() => {
    if (isConnected) {
      // setShowModal(false);
    }
  }, [isConnected]);

  return (
    <React.Fragment>
      {/* Connect Wallet Modal Starts Here */}
      <div className='app-modal'>
        <div
          className="wallet-wrapper justify-center items-center flex overflow-x-hidden overflow-y-auto fixed inset-0 z-50 outline-none focus:outline-none"
        >
          <div className="relative w-[95%] flex items-center mx-auto h-full">
            {/*content*/}
            <div className={`${theme === "light" ? "bg-lightcard-gradient" : "bg-mine-gradient"
              } max-[768px]:w-[95%] relative mx-auto border-0 rounded-2xl shadow-2xl flex flex-col w-[450px] outline-none focus:outline-none`}>
              {/*header*/}
              <button className='close-modal absolute right-[20px] top-[12px]' onClick={() => setShowWalletModal(false)}>
                <CloseIcon />
              </button>
              <div className='modal-content rounded-2xl px-[20px] py-3 mt-4'>
                <div className='mt-4 mb-5'>
                  <h2 className='text-2xl text-center font-bold text-white'>
                    Connect Wallet
                  </h2>
                  <p className='text-base text-center'>Select your favorite wallet to log in.</p>
                </div>
                <div className='mb-6'>
                  {/* {window?.isWow != 1 && (
                    <WalletButton.Custom wallet="wow-earn-wallet">
                      {({ ready, connect }) => (
                        <button onClick={() => { connect(); setShowWalletModal(false) }} className='flex mb-1 hover:bg-banner-gradient hover:border-wow border-transparent border-2 w-full text-base justify-between items-center bg-[#002427] rounded-lg py-[14px] px-6'>
                          <div className='flex items-center gap-4'>
                            <img src='/images/logo.svg' className='w-10' alt='Media' />
                            <span>WOW Connect</span>
                          </div>
                          <div className='text-xs rounded py-1 px-4 text-black bg-primary-gradient font-medium'>Popular</div>
                        </button>
                      )}
                    </WalletButton.Custom>
                  )} */}

                  <WalletButton.Custom wallet="walletConnect">
                    {({ ready, connect }) => (
                      <button onClick={() => { connect(); setShowWalletModal(false) }} className={` ${theme === "light" ? "bg-white text-black" : "bg-[#002427]"
                        } flex mb-1 hover:bg-banner-gradient hover:border-wow border-transparent border-2 w-full text-base font-medium gap-4 items-center rounded-lg py-[14px] px-6`}>
                        <img src='/images/walletconnect.png' className='w-10' alt='Media' />
                        <span>Wallet Connect</span>
                      </button>
                    )}
                  </WalletButton.Custom>

                  {/* <WalletButton.Custom wallet="phantom">
                    {({ ready, connect }) => (
                      <button onClick={() => {connect(); setShowWalletModal(false)}} className='flex mb-3 hover:bg-[#393939] w-full text-base gap-4 items-center bg-[#141414] rounded-lg py-[14px] px-6'>
                        <img className='rounded-lg w-11' src='https://187760183-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-MVOiF6Zqit57q_hxJYp%2Fuploads%2FHEjleywo9QOnfYebBPCZ%2FPhantom_SVG_Icon.svg?alt=media&token=71b80a0a-def7-4f98-ae70-5e0843fdaaec' alt='Media' />
                        <span>Phantom</span>
                      </button>
                    )}
                  </WalletButton.Custom> */}
                  {connectors.map((item, key) => (
                    <>
                      {item.name !== "WalletConnect" &&
                        item?.name !== "Browser Wallet" &&
                        item.name !== "Phantom" &&
                        item?.name !== "Injected" && (
                          <button onClick={() => handleConnect(item)} className={` ${theme === "light" ? "bg-white text-black" : "bg-[#002427]"
                            } flex mb-1 hover:bg-banner-gradient hover:border-wow border-transparent border-2 w-full text-base font-medium gap-4 items-center rounded-lg py-[14px] px-6`}>
                            <div className='flex items-center gap-4'>
                              <img src={item?.icon} className='w-10' alt='Media' />
                              <span>{item.name}</span>
                            </div>
                          </button>
                        )}
                    </>
                  ))}
                </div>
                {/*body*/}

              </div>
            </div>

          </div>
        </div>
      </div>
      {/* Connect Wallet Modal Ends Here */}
    </React.Fragment>
  )
}
