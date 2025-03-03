"use client";
import Link from 'next/link';
import React from 'react';
import Image from 'next/image';
import SearchField from './../searchfield/searchfield';

export default function GasModal({ setShowGasModal }) {
  return (
    <React.Fragment>
      {/* Gas Modal Starts Here */}
      <div className='app-modal'>
        <div
          className="wallet-wrapper justify-center items-center flex overflow-x-hidden overflow-y-auto fixed inset-0 z-50 outline-none focus:outline-none"
        >
          <div className="relative w-[95%] mx-auto h-full">
            {/*content*/}
            <div className="max-[768px]:w-[95%] mt-11 relative mx-auto border-0 rounded-2xl shadow-2xl flex flex-col w-[450px] bg-black outline-none focus:outline-none">
              {/*header*/}
              <button className='close-modal absolute right-[20px] top-[12px]' onClick={() => setShowGasModal(false)}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width={24}
                  height={24}
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <path
                    d="M16.34 9.322C16.4361 9.23244 16.5136 9.12484 16.568 9.00533C16.6225 8.88583 16.6529 8.75676 16.6575 8.62551C16.6621 8.49425 16.6408 8.36337 16.5948 8.24035C16.5488 8.11733 16.4791 8.00457 16.3895 7.9085C16.2999 7.81244 16.1923 7.73496 16.0728 7.68049C15.9533 7.62601 15.8243 7.5956 15.693 7.59101C15.5618 7.58641 15.4309 7.60771 15.3079 7.6537C15.1848 7.69968 15.0721 7.76944 14.976 7.859L12.05 10.587L9.32201 7.66C9.13948 7.47305 8.89102 7.36496 8.6298 7.35887C8.36859 7.35278 8.11536 7.44917 7.92431 7.62741C7.73327 7.80565 7.61957 8.05159 7.60755 8.3126C7.59553 8.57361 7.68615 8.82896 7.86001 9.024L10.588 11.95L7.66101 14.678C7.56155 14.7667 7.48082 14.8743 7.42354 14.9946C7.36626 15.1149 7.3336 15.2454 7.32747 15.3785C7.32135 15.5116 7.34188 15.6446 7.38786 15.7696C7.43384 15.8946 7.50434 16.0092 7.59523 16.1067C7.68612 16.2041 7.79555 16.2824 7.91711 16.3369C8.03867 16.3914 8.16991 16.4211 8.3031 16.4242C8.4363 16.4273 8.56877 16.4038 8.69274 16.355C8.81671 16.3062 8.92968 16.2331 9.02501 16.14L11.951 13.413L14.679 16.339C14.7671 16.4403 14.8747 16.5228 14.9953 16.5816C15.116 16.6405 15.2472 16.6744 15.3813 16.6814C15.5153 16.6885 15.6494 16.6684 15.7756 16.6225C15.9017 16.5766 16.0173 16.5058 16.1155 16.4142C16.2137 16.3227 16.2924 16.2123 16.3471 16.0897C16.4017 15.9671 16.4311 15.8347 16.4334 15.7005C16.4358 15.5663 16.4112 15.433 16.3609 15.3085C16.3107 15.1841 16.2359 15.071 16.141 14.976L13.414 12.05L16.34 9.322Z"
                    fill="white"
                  />
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M1 12C1 5.925 5.925 1 12 1C18.075 1 23 5.925 23 12C23 18.075 18.075 23 12 23C5.925 23 1 18.075 1 12ZM12 21C10.8181 21 9.64778 20.7672 8.55585 20.3149C7.46392 19.8626 6.47177 19.1997 5.63604 18.364C4.80031 17.5282 4.13738 16.5361 3.68508 15.4442C3.23279 14.3522 3 13.1819 3 12C3 10.8181 3.23279 9.64778 3.68508 8.55585C4.13738 7.46392 4.80031 6.47177 5.63604 5.63604C6.47177 4.80031 7.46392 4.13738 8.55585 3.68508C9.64778 3.23279 10.8181 3 12 3C14.3869 3 16.6761 3.94821 18.364 5.63604C20.0518 7.32387 21 9.61305 21 12C21 14.3869 20.0518 16.6761 18.364 18.364C16.6761 20.0518 14.3869 21 12 21Z"
                    fill="white"
                  />
                </svg>

              </button>
              <div className='modal-content rounded-2xl bg-black px-[20px] py-3 mt-4'>
                <div className='mt-4 mb-6'>
                  <h2 className='text-base text-center font-bold text-white'>
                    Get ready for your destination
                  </h2>
                  <p className='text-sm text-center text-white my-6'>
                    Choose the amount of <span className='text-wow'>WOW</span> you want to swap.
                    The total amount you will pay in your wallet includes the gas you will be airdropping to your destination.
                  </p>
                  <div className='grid grid-cols-3 rounded-full bg-[#00513a]'>
                    <button className='bg-mine-gradient hover:bg-primary-gradient focus:bg-primary-gradient uppercase font-medium text-white text-sm rounded-full py-2'>None</button>

                    <button className='hover:bg-primary-gradient focus:bg-primary-gradient uppercase font-medium text-white text-sm rounded-full py-2'>Medium</button>

                    <button className='hover:bg-primary-gradient focus:bg-primary-gradient uppercase font-medium text-white text-sm rounded-full py-2'>Max</button>
                  </div>
                </div>
                <div className='mb-6 overflow-y-auto'>
                  <div className='flex justify-between items-center mb-4'>
                    <p className='text-sm'>Custom Amount</p>
                    <div className='flex justify-center'>
                      <input type="checkbox" id="switch1" /><label className='toggle' for="switch1">Toggle</label>
                    </div>
                  </div>

                  <div className='relative'>
                    <input type='text' className='rounded-2xl outline-none focus:outline-none w-full py-2 px-9 bg-gray-800 border border-gray-600' />
                    <span className='absolute left-2 top-3'>
                      <Image width={100} height={100} src='/images/logo.svg' alt='Media' className='w-4 rounded-full' />
                    </span>
                    <button className='rounded-full text-xs py-[3px] px-2 bg-flash hover:bg-mine-gradient absolute right-2 top-[10px]'>Max</button>

                    <p className='text-xs text-[#f56868] font-medium mt-2 text-end'>
                      Requested airdrop exceeds max: 1 WOW
                    </p>
                  </div>
                </div>
                {/*body*/}

              </div>
            </div>

          </div>
        </div>
      </div>
      {/* Gas Modal Ends Here */}
    </React.Fragment>
  )
}
