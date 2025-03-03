"use client"
import { http } from 'wagmi'
import { connectorsForWallets, getDefaultConfig, getWalletConnectConnector } from '@rainbow-me/rainbowkit'
import { bsc, bscTestnet } from 'wagmi/chains';
import {
    injectedWallet,
    phantomWallet,
    walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets';

const projectId = 'c9303d447e58d4f4156c7c8ab0ce7e31';

const wowChain = {
    id: 1916,
    name: 'WOW',
    nativeCurrency: { name: 'WOW', symbol: 'WOW', decimals: 18 },
    rpcUrls: {
        default: { http: ['https://rpc.wowearn.io/'] },
        public: { http: ['https://rpc.wowearn.io/'] },
    },
    blockExplorers: {
        default: { name: 'WOW', url: 'https://wowearn.io/' },
    },
    testnet: false,
}

const juChain = {
    id: 66633666,
    name: 'JuChain Testnet',
    nativeCurrency: { name: 'JU', symbol: 'JU', decimals: 18 },
    rpcUrls: {
        default: { http: [' https://testnet-rpc.juchain.org/'] },
        public: { http: [' https://testnet-rpc.juchain.org/'] },
    },
    blockExplorers: {
        default: { name: 'JU', url: 'http://explorer-testnet.juchain.org/' },
    },
    testnet: false,
}

const wowEarnWallet = ({ projectId }) => ({
    id: 'wow-earn-wallet',
    name: 'WOW EARN Wallet',
    iconUrl: 'https://media.licdn.com/dms/image/D4D0BAQGeS9ozbxH1iw/company-logo_200_200/0/1710776030038/wow_earn_logo?e=2147483647&v=beta&t=tKh7o3CkO0ueVmWMYOPlM7U0hWla1Y4QySRVEE7KnTE',
    iconBackground: '#0c2f78',
    downloadUrls: {
        android: 'https://play.google.com/store/apps/dev?id=8086605849401192032&hl=en_US',
        ios: 'https://apps.apple.com/us/app/wow-earn-btc-crypto-wallet/id6443434220',
    },
    mobile: {
        getUri: (uri) => `ullawallet://wc?uri=${encodeURIComponent(uri)}`,
    },
    qrCode: {
        getUri: (uri) => uri,
        // getUri: (uri) => `ullawallet://wc?uri=${(uri)}`,
        instructions: {
            learnMoreUrl: 'https://my-wallet/learn-more',
            steps: [
                {
                    description:
                        'We recommend putting My Wallet on your home screen for faster access to your wallet.',
                    step: 'install',
                    title: 'Open the My Wallet app',
                },
                {
                    description:
                        'After you scan, a connection prompt will appear for you to connect your wallet.',
                    step: 'scan',
                    title: 'Tap the scan button',
                },
            ],
        },
    },
    extension: {
        instructions: {
            learnMoreUrl: 'https://my-wallet/learn-more',
            steps: [
                {
                    description:
                        'We recommend pinning My Wallet to your taskbar for quicker access to your wallet.',
                    step: 'install',
                    title: 'Install the My Wallet extension',
                },
                {
                    description:
                        'Be sure to back up your wallet using a secure method. Never share your secret phrase with anyone.',
                    step: 'create',
                    title: 'Create or Import a Wallet',
                },
                {
                    description:
                        'Once you set up your wallet, click below to refresh the browser and load up the extension.',
                    step: 'refresh',
                    title: 'Refresh your browser',
                },
            ],
        },
    },
    createConnector: getWalletConnectConnector({ projectId }),
});

const connectors = connectorsForWallets(
    [
        {
            groupName: 'Recommended',
            wallets: [wowEarnWallet, walletConnectWallet, injectedWallet, phantomWallet],
        },
    ],
    {
        appName: 'WOW EARN App',
        projectId: projectId,
    }
);

export const config = getDefaultConfig({
    appName: 'WOW EARN App',
    projectId,
    chains: [wowChain, bscTestnet, juChain],
    connectors: connectors,
    transports: {
        [wowChain.id]: http(),
        [bscTestnet.id]: http(),
        [juChain.id]: http(),
    },
})

// import { createConfig, http } from 'wagmi'
// import { walletConnect } from 'wagmi/connectors'
// import { bscTestnet, bsc } from '@wagmi/chains'
// import { getDefaultProvider } from 'ethers';

// const projectId = '8e5776c8f369b3a8490d1677bdc34773';

// export const config = createConfig({
//     autoConnect: true,
//     provider: getDefaultProvider(),
//     chains: [bscTestnet],
//     connectors: [
//         walletConnect({
//             projectId,
//             showQrModal: true,
//         }),
//     ],
//     transports: {
//         // [wowChain.id]: http(),
//         [bscTestnet.id]: http(),
//     },
// })
// // import { createConfig, http } from 'wagmi'
// // import { mainnet, sepolia } from 'wagmi/chains'
// // import { injected } from 'wagmi/connectors'
// // import { walletConnect } from '@wagmi/connectors'


// // export const config = createConfig({
// //   chains: [mainnet, sepolia],
// //   connectors: [
// //     walletConnect({
// //       projectId: '8e5776c8f369b3a8490d1677bdc34773', // Replace with your WalletConnect project ID
// //     }),
// //   ],
// //   transports: {
// //     [mainnet.id]: http(),
// //     [sepolia.id]: http(), 
// //   },
// // })
// import { createConfig, http } from 'wagmi'
// import { base, mainnet, sepolia } from 'wagmi/chains'
// import { walletConnect } from 'wagmi/connectors'
// import { getDefaultProvider } from 'ethers'

// const projectId = '8e5776c8f369b3a8490d1677bdc34773';
// const wowChain = {
//     id: 1916,
//     name: 'WOW',
//     nativeCurrency: {
//         name: 'WOW',
//         symbol: 'WOW',
//         decimals: 18,
//     },
//     rpcUrls: {
//         default: {
//             http: ['https://rpc.wowearn.io/'], // Replace with the actual RPC URL of the Wow chain
//         },
//     },
//     blockExplorers: {
//         default: { name: 'WOW', url: 'https://wowearn.io/' }, // Replace with the actual block explorer URL
//     },
//     testnet: false, // Set to true if this is a testnet
// }

// const localHardhatChain = {
//     id: 31337,
//     name: 'Local Hardhat',
//     nativeCurrency: {
//         name: 'ETH',
//         symbol: 'ETH',
//         decimals: 18,
//     },
//     rpcUrls: {
//         default: {
//             http: ['http://127.0.0.1:8545'], // Default RPC URL for local Hardhat network
//         },
//     },
//     blockExplorers: {
//         default: { name: 'Hardhat', url: 'http://localhost:8545' }, // Local block explorer URL
//     },
//     testnet: true, // Local Hardhat network is typically used for testing
// }
// export const config = createConfig({
//     autoConnect: true,
//     provider: getDefaultProvider(),
//     chains: [wowChain],
//     connectors: [
//         walletConnect({
//             projectId,
//             infuraId: projectId,
//             showQrModal: true,
//         }),
//     ],
//     transports: {
//         // [mainnet.id]: http(),
//         // [sepolia.id]: http(),
//         // [base.id]: http(),
//         [wowChain.id]: http(),
//     },
// })