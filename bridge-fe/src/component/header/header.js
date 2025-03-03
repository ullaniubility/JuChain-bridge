"use client";
import React, { useState } from 'react'
import Link from 'next/link';
import Tooltip from "rc-tooltip";
import copy from 'copy-to-clipboard';
import Image from 'next/image';
import { CopyIcon, LogoutIcon, SunIcon, MoonIcon, WalletIcon } from '@/assets';
import { useTheme } from '@/theme/ThemeProvider';
import "rc-tooltip/assets/bootstrap.css";

export default function Header({ setShowWalletModal, isConnected, address, disconnect, connector }) {
  const { theme, toggleTheme } = useTheme();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    copy(address);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 2000);
    // You can add a toast notification here
  };

  console.log(connector?.name === 'MetaMask')
  return (
    <React.Fragment>
      {/* Header Section Starts Here */}
      <header className={` ${theme === "light" ? "bg-light-gradient" : "bg-smooth"
        } sticky w-full top-0 z-20`}>
        <nav className='py-3 w-[90%] mx-auto'>
          <div className='flex justify-between items-center'>
            <Link href={'/'}>
              <Image width={100} height={100} src='/images/logo.svg' className='w-8 md:w-10 block' alt='Media' />
            </Link>
            <div className='flex items-center gap-2'>
              <label className="switch">
                <span className="sun">
                  <SunIcon />
                </span>
                <span className="moon">
                  <MoonIcon />
                </span>
                <input type="checkbox" className="input" checked={theme === "light"} onChange={toggleTheme} />
                <span className="slider" />
              </label>
              {isConnected ?
                <div className='relative group'>
                  <button
                    class={` ${theme === "light" ? "bg-mine-gradient" : "bg-coin-gradient"
                      } flex items-center gap-2 rounded-full px-4 py-[6.5px] text-sm font-medium text-white`}
                  >
                    <WalletIcon /> {address.substring(0, 7)}...{address.substring(address.length - 5)}
                    <div className={`${theme === "light" ? "bg-light border-wow border-2" : "bg-smooth"
                      } rounded-md group-hover:block opacity-0 invisible transition-all duration-300 group-hover:opacity-100 group-hover:visible p-4 border-[0.3px] absolute top-10 right-0 shadow-lg`}>
                      <div className='flex gap-2 items-center mb-3'>
                        <Image width={100} height={100} src={connector?.name === 'MetaMask' ? '/images/metamask.png' : '/images/walletconnect.png'} className='w-7' alt='Media' />
                        <p className={`${theme === "light" ? "text-black" : "text-white"
                          } text-base`}>EVM</p>
                      </div>
                      <div className='grid grid-cols-[auto_40px] gap-2 items-center'>

                        <div className={`${theme === "light" ? "bg-lightbg border-wow" : "bg-gray-900"
                          } grid grid-cols-[auto_40px] items-center border-[.3px] border-gray-700 rounded-md px-3 py-2`}>
                          <p className='text-sm font-normal text-white'>{address.substring(0, 7)}...{address.substring(address.length - 5)}</p>
                          <button onClick={() => handleCopy()} className='hover:opacity-20 flex justify-end'>
                            <Tooltip
                              placement="top" // Tooltip appears above the button
                              trigger={[]}
                              visible={copied}
                              overlay={<span>Copied!</span>}
                            >
                              <CopyIcon />
                            </Tooltip>
                          </button>
                        </div>
                        <button
                          onClick={() => disconnect()}
                          className={` ${theme === "light" ? "bg-lightbg border-wow" : "bg-gray-900"
                            } p-2 hover:bg-mine-gradient rounded-md border-gray-700 hover:border-gray-600 border-[.3px]`}>
                          <LogoutIcon />
                        </button>
                      </div>
                    </div>
                  </button>
                </div> :
                <button onClick={() => setShowWalletModal(true)}
                  class={` ${theme === "light" ? "bg-mine-gradient" : "bg-coin-gradient"
                    } relative rounded-full px-4 py-[6.5px] text-sm font-bold text-white transition-colors duration-300 ease-linear before:absolute before:right-1/2 before:top-1/2 before:-z-[1] before:h-3/4 before:w-2/3 before:origin-bottom-left before:-translate-y-1/2 before:translate-x-1/2 before:animate-ping before:rounded-full before:bg-mine-gradient hover:bg-primary-gradient hover:before:bg-primary-gradient`}
                >
                  Connect Wallet
                </button>
              }
            </div>
          </div>
        </nav>
      </header>
      {/* Header Section Ends Here */}

    </React.Fragment >
  )
}
