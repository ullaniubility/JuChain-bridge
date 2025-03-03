"use client";
import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import SearchField from './../searchfield/searchfield';
import { CloseIcon } from '@/assets';
import { useTheme } from '@/theme/ThemeProvider';

export default function TokenModal({ setShowTokenModal, setSelectedData, selectedData, showTokenModal }) {
  const networkArr = [
    {
      name: 'BNB Mainnet', image: '/images/bnb.svg', des: 'BNB', chainId: 97, token: [
        { name: 'WOW', image: '/images/logo.svg', des: 'WOW', address: '0x181Af90a5dB66Bd5B8cB6EF9A4e0463Dc877bd7b' },
        { name: 'Wrapped JU', image: '/images/juchain_logo.jpg', des: 'WJU', address: '0x2a8930006953F20ff0eDe9588e3ca6Cde6A3f940' },
      ]
    },
    {
      name: 'Ju Chain Network', image: '/images/juchain_logo.jpg', des: 'Ju Chain', chainId: 66633666, token: [
        { name: 'Wrapped WOW', image: '/images/logo.svg', des: 'WWow', address: '0x2a8930006953F20ff0eDe9588e3ca6Cde6A3f940' },
        { name: 'JU Coin', image: '/images/jucoin.jpg', des: 'JU', address: '' },
      ]
    }
  ];
  const [selectedNetwork, setSelectedNetwork] = useState(showTokenModal === 'networkPay' ?
    (selectedData?.networkPay === "BNB Mainnet" ? networkArr[0] : selectedData?.networkPay === "Ju Chain Network" ? networkArr[1] : null)
    : showTokenModal === "networkReceive" ? selectedData?.networkReceive === "BNB Mainnet" ? networkArr[0] : selectedData?.networkReceive === "Ju Chain Network" ? networkArr[1] : null : null);
  const [firstTime, setFirstTime] = useState(true);
  const [secTime, setSecTime] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const { theme, toggleTheme } = useTheme();

  const filteredTokens = selectedNetwork?.token?.filter(token =>
    token.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    token.des.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    if (firstTime && selectedNetwork === null && selectedData?.networkPay === null) {
      handleNetworkSelect(networkArr[0]);
      setSecTime(true)
    }
  }, [firstTime])

  useEffect(() => {
    if (selectedNetwork?.name && firstTime && selectedNetwork && selectedData?.networkPay === null) {
      handleTokenSelect(networkArr[0].token[0]);
      setFirstTime(false);
      setSecTime(false)
    }
  }, [selectedNetwork, firstTime, secTime])

  const handleNetworkSelect = (network) => {
    setSelectedNetwork(network);
  };

  const handleTokenSelect = (token) => {
    let receiveNetwork = null;
    let receiveToken = null;

    // Mapping for BNB Mainnet → Ju Chain Network
    if (selectedNetwork.name === "BNB Mainnet" && token.name === "WOW") {
      receiveNetwork = networkArr.find(net => net.name === "Ju Chain Network");
      receiveToken = receiveNetwork.token.find(tok => tok.name === "Wrapped WOW");
    } else if (selectedNetwork.name === "BNB Mainnet" && token.name === "Wrapped JU") {
      receiveNetwork = networkArr.find(net => net.name === "Ju Chain Network");
      receiveToken = receiveNetwork.token.find(tok => tok.name === "JU Coin");
    }
    // Mapping for Ju Chain Network → BNB Mainnet
    else if (selectedNetwork.name === "Ju Chain Network" && token.name === "Wrapped WOW") {
      receiveNetwork = networkArr.find(net => net.name === "BNB Mainnet");
      receiveToken = receiveNetwork.token.find(tok => tok.name === "WOW");
    } else if (selectedNetwork.name === "Ju Chain Network" && token.name === "JU Coin") {
      receiveNetwork = networkArr.find(net => net.name === "BNB Mainnet");
      receiveToken = receiveNetwork.token.find(tok => tok.name === "Wrapped JU");
    }
    console.log("receiveNetwork", receiveNetwork, receiveToken)
    if (showTokenModal === "networkPay") {
      setSelectedData({
        ...selectedData,
        networkReceive: receiveNetwork ? receiveNetwork.name : selectedNetwork.name,
        tokenReceive: receiveToken ? receiveToken.name : token.name,
        addressReceive: receiveToken ? receiveToken.address : token.address,
        networkReceiveImage: receiveNetwork ? receiveNetwork.image : selectedNetwork.image,
        tokenReceiveImage: receiveToken ? receiveToken.image : token.image,
        tokenReceiveName: receiveToken ? receiveToken.des : token.des,
        networkPay: selectedNetwork.name,
        tokenPay: token.name,
        addressPay: token.address,
        networkPayImage: selectedNetwork.image,
        tokenPayImage: token.image,
        tokenPayName: token.des,
        chainIdPay: selectedNetwork.chainId,
        chainIdReceive: receiveNetwork ? receiveNetwork.chainId : selectedNetwork.chainId
      });
    } else if (showTokenModal === "networkReceive") {
      setSelectedData({
        ...selectedData,
        networkReceive: selectedNetwork.name,
        tokenReceive: token.name,
        addressReceive: token.address,
        networkReceiveImage: selectedNetwork.image,
        tokenReceiveImage: token.image,
        networkPay: receiveNetwork ? receiveNetwork.name : selectedNetwork.name,
        tokenPay: receiveToken ? receiveToken.name : token.name,
        addressPay: receiveToken ? receiveToken.address : token.address,
        networkPayImage: receiveNetwork ? receiveNetwork.image : selectedNetwork.image,
        tokenPayImage: receiveToken ? receiveToken.image : token.image,
        tokenPayName: receiveToken ? receiveToken.des : token.des,
        tokenReceiveName: token.des,
        chainIdPay: receiveNetwork ? receiveNetwork.chainId : selectedNetwork.chainId,
        chainIdReceive: selectedNetwork.chainId
      });
    }

    setShowTokenModal({ type: null });
  };

  return (
    <React.Fragment>
      <div className={selectedData?.networkPay === null ? 'hidden' : 'app-modal'}>
        <div className="wallet-wrapper justify-center items-center flex overflow-x-hidden overflow-y-auto fixed inset-0 z-50 outline-none focus:outline-none">
          <div className="relative w-[95%] flex items-center mx-auto h-full">
            <div className={`${theme === "light" ? "bg-lightcard-gradient" : "bg-mine-gradient"
              } max-[768px]:w-[95%] relative mx-auto border-0 rounded-2xl shadow-2xl flex flex-col w-[450px] outline-none focus:outline-none`}>
              <button className='close-modal absolute right-[20px] top-[12px]' onClick={() => setShowTokenModal(false)}>
                <CloseIcon />
              </button>

              <div className='modal-content rounded-2xl px-[20px] py-3 mt-4'>
                <div className='mt-4 mb-2'>
                  <h2 className='text-base text-center font-semibold text-white'>
                    {selectedNetwork ? `Select a token you ${showTokenModal === "networkPay" ? "pay" : "receive"}` : `Select a network you ${showTokenModal === "networkPay" ? "pay" : "receive"}`}
                  </h2>
                </div>

                <div className='mb-6 overflow-y-auto'>
                  <>
                    <p className='text-sm font-medium mb-2'>All Networks</p>
                    <div className='grid grid-cols-2 gap-2'>
                      {networkArr.map((network) => (
                        <button key={network.name} onClick={() => handleNetworkSelect(network)}
                          className={`flex justify-between items-center w-full px-3 py-[6px] rounded-md hover:bg-mine-gradient ${network.name === selectedNetwork?.name ? "bg-mine-gradient border-2" : "border"} border-wow hover:border-green-300`}>
                          <div className='flex items-center gap-3'>
                            <img width={100} height={100} src={network.image} className='w-8 h-8 rounded-full' alt='Media' />
                            <div className='text-left'>
                              <p className={`${theme === "light" ? "text-[#bbb]" : "text-gray-500"
                                } text-xs`}>{network.name}</p>
                              <p className='text-sm uppercase'>{network.des}</p>
                            </div>
                          </div>
                          {/* <ChecksIcon /> */}
                        </button>
                      ))}
                    </div>
                    <hr className='my-5' />
                    <div>
                      <p className='text-sm font-medium mb-1'>All Tokens</p>
                      <div className='mb-3 mt-2'>
                      <SearchField value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                      </div>
                      {(searchQuery && filteredTokens?.length > 0) || (!searchQuery && selectedNetwork?.token) ? (filteredTokens?.length > 0 ? filteredTokens : selectedNetwork?.token).map((token) => (
                        <button
                          key={token.name} onClick={() => handleTokenSelect(token)}
                          className={`'flex justify-between items-center w-full px-3 py-[6px] rounded-md hover:bg-mine-gradient ${((showTokenModal === "networkPay" && selectedData?.tokenPay === token.name) || (showTokenModal === "networkReceive" && selectedData?.tokenReceive === token.name)) ? "bg-[#0d4045] border-2 border-wow" : "border border-wow"} hover:border-green-300 mb-2`}>
                          <div className='flex items-center gap-3'>
                            <Image width={100} height={100} src={token?.image || '/images/logo.svg'} className='w-8 h-8 rounded-full' alt='Media' />
                            <div className='text-left'>
                              <p className={`${theme === "light" ? "text-[#bbb]" : "text-gray-500"
                                } text-xs`}>{token.name}</p>
                              <p className='text-sm uppercase'>{token.des}</p>
                            </div>
                          </div>
                        </button>
                      )) : <div className='flex justify-center items-center mt-[50px]'>No token </div>}
                    </div>
                  </>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}
