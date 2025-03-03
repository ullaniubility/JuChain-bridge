import bscbridgetwoway from "./BscBridgeTwoWay/BscBridgeTwoWay.json";
import jubridgetwoway from "./JuBridgeTwoWay/JuBridgeTwoWay.json";
import wrappedjuonsbsc from "./WrappedJuOnBsc/WrappedJuOnBsc.json";

export const CONTRACT_ADDRESSES = {
    bsc: {
        BSC_BRIDGE: "0x641F87c3F21618e0912831aF8b2C9dE6B28651B3",
    },
    juchain: {
        JU_BRIDGE: "0x8a5D32f283BD2D29dfD99a14305e1695bb1eaE80",
    },
};

export const ABIS = {
    BSC_BRIDGE_TWO_WAY: bscbridgetwoway,
    JU_BRIDGE_TWO_WAY: jubridgetwoway,
    APPROVE_TOKEN: wrappedjuonsbsc
};