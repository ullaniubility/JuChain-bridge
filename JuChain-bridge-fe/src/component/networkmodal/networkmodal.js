"use client";
import Link from 'next/link';
import React from 'react';
import Image from 'next/image';
import SearchField from './../searchfield/searchfield';
import { CloseIcon } from '@/assets';

export default function NetworkModal({ setShowNetworkModal }) {
  const networkArr = [{ name: 'BNB Mainnet', image: '/images/bnb.svg', des: 'BNB' }, { name: 'Ju Chain Network', image: '/images/juchain_logo.jpg', des: 'Ju Chain' }]
  return (
    <React.Fragment>
      <div className='app-modal'>
        <div
          className="wallet-wrapper justify-center items-center flex overflow-x-hidden overflow-y-auto fixed inset-0 z-50 outline-none focus:outline-none"
        >
          <div className="relative w-[95%] mx-auto h-full">
            <div className="max-[768px]:w-[95%] relative mx-auto border-0 rounded-2xl shadow-2xl flex flex-col w-[450px] bg-black outline-none focus:outline-none">
              <button className='close-modal absolute right-[20px] top-[12px]' onClick={() => setShowNetworkModal(false)}>
                <CloseIcon />
              </button>
              <div className='modal-content rounded-2xl bg-black px-[20px] py-3 mt-4'>
                <div className='mt-4 mb-11'>
                  <h2 className='text-base text-center font-bold text-white'>
                    Select Network
                  </h2>
                  <SearchField />
                </div>
                <div className='mb-6 overflow-y-auto network-wrapper'>
                  {networkArr?.map(({ name, image, des }, key) => (
                    <button key={key} className='flex justify-between items-center w-full p-3 rounded-xl hover:bg-spin-gradient'>
                      <div className='flex items-center gap-3'>
                        <img width={100} height={100} src={image} className='w-8 h-8 rounded-full' alt='Media' />
                        <div className='text-left'>
                          <p className='text-xs text-gray-500'>{name}</p>
                          <p className='text-sm uppercase'>{des}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </React.Fragment>
  )
}
