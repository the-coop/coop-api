   //  // The asset was also created with the ability for it to be revoked by 
   //  // the clawbackaddress. If the asset was created or configured by the manager
   //  // to not allow this by setting the clawbackaddress to "" then this would 
   //  // not be possible.
   //  // We will now clawback the 10 assets in account3. account2
   //  // is the clawbackaccount and must sign the transaction
   //  // The sender will be be the clawback adress.
   //  // the recipient will also be be the creator in this case
   //  // that is account3
   //  sender = recoveredAccount2.addr;
   //  recipient = recoveredAccount1.addr;
   //  revocationTarget = recoveredAccount3.addr;
   //  closeRemainderTo = undefined;
   //  amount = 10;
   //  // signing and sending "txn" will send "amount" assets from "revocationTarget" to "recipient",
   //  // if and only if sender == clawback manager for this asset

   //  let rtxn = algosdk.makeAssetTransferTxnWithSuggestedParams(sender, recipient, closeRemainderTo, revocationTarget,
   //     amount, note, assetID, params);
   //  // Must be signed by the account that is the clawback address    
   //  rawSignedTxn = rtxn.signTxn(recoveredAccount2.sk)
   //  let rtx = (await algodclient.sendRawTransaction(rawSignedTxn).do());
   //  console.log("Transaction : " + rtx.txId);
   //  // wait for transaction to be confirmed
   //  await waitForConfirmation(algodclient, rtx.txId);

   //  // You should now see 0 assets listed in the account information
   //  // for the third account
   //  console.log("Account 3 = " + recoveredAccount3.addr);
   //  await printAssetHolding(algodclient, recoveredAccount3.addr, assetID);