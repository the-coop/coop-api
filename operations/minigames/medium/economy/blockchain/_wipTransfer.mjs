// // Transfer New Asset:
// // Now that account3 can recieve the new tokens 
// // we can tranfer tokens in from the creator
// // to account3
// sender = recoveredAccount1.addr;
// recipient = recoveredAccount3.addr;
// revocationTarget = undefined;
// closeRemainderTo = undefined;
// //Amount of the asset to transfer
// amount = 10;

// // signing and sending "txn" will send "amount" assets from "sender" to "recipient"
// let xtxn = algosdk.makeAssetTransferTxnWithSuggestedParams(sender, recipient, closeRemainderTo, revocationTarget,
//         amount,  note, assetID, params);
// // Must be signed by the account sending the asset  
// rawSignedTxn = xtxn.signTxn(recoveredAccount1.sk)
// let xtx = (await algodclient.sendRawTransaction(rawSignedTxn).do());
// console.log("Transaction : " + xtx.txId);
// // wait for transaction to be confirmed
// await waitForConfirmation(algodclient, xtx.txId);

// // You should now see the 10 assets listed in the account information
// console.log("Account 3 = " + recoveredAccount3.addr);
// await printAssetHolding(algodclient, recoveredAccount3.addr, assetID);