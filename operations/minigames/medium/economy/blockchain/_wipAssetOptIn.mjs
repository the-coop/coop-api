// // Opting in to transact with the new asset
// // Allow accounts that want recieve the new asset
// // Have to opt in. To do this they send an asset transfer
// // of the new asset to themseleves 
// // In this example we are setting up the 3rd recovered account to 
// // receive the new asset
// let sender = recoveredAccount3.addr;
// let recipient = sender;
// // We set revocationTarget to undefined as 
// // This is not a clawback operation
// let revocationTarget = undefined;
// // CloseReaminerTo is set to undefined as
// // we are not closing out an asset
// let closeRemainderTo = undefined;
// // We are sending 0 assets
// amount = 0;
// // signing and sending "txn" allows sender to begin accepting asset specified by creator and index
// let opttxn = algosdk.makeAssetTransferTxnWithSuggestedParams(sender, recipient, closeRemainderTo, revocationTarget,
//         amount, note, assetID, params);
// // Must be signed by the account wishing to opt in to the asset    
// rawSignedTxn = opttxn.signTxn(recoveredAccount3.sk);
// let opttx = (await algodclient.sendRawTransaction(rawSignedTxn).do());
// console.log("Transaction : " + opttx.txId);
// // wait for transaction to be confirmed
// await waitForConfirmation(algodclient, opttx.txId);
// //You should now see the new asset listed in the account information
// console.log("Account 3 = " + recoveredAccount3.addr);
// await printAssetHolding(algodclient, recoveredAccount3.addr, assetID);