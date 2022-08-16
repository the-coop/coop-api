import algosdk from 'algosdk';

export default async function test() {
    const API_URL = 'https://betanet-algorand.api.purestake.io/ps2'
    const token = { 'X-API-Key': process.env.PURESTAKE_KEY };
    
    const algodclient = new algosdk.Algodv2(token, API_URL, '');

    console.log('checking status...');
    let status = (await algodclient.status().do());
    console.log(status);
    
    // (async() => {
    
    //   let params = await algodClient.getTransactionParams().do();
    
    //   let signedTxn = algosdk.signTransaction(txn, recoveredAccount.sk);
    //   let sendTx = await algodClient.sendRawTransaction(signedTxn.blob).do();
      
    //   console.log("Transaction : " + sendTx.txId);
    // })().catch(e => {
    //     console.log(e);
    // });
}