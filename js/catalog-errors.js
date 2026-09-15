const CatalogErrors = (()=>{
  const errorMessages={
  "NDL-NOT-FOUND": "このISBNに一致する書誌情報が見つかりませんでした。ISBNを確認するか、手入力してください。",
  "NDL-400": "国会図書館への検索条件が受け付けられませんでした。",
  "NDL-401": "国会図書館へのアクセスが拒否されました。時間を置いて再度お試しください。",
  "NDL-403": "国会図書館へのアクセスが拒否されました。時間を置いて再度お試しください。",
  "NDL-404": "国会図書館の検索APIが見つかりませんでした。検索先の確認が必要です。",
  "NDL-429": "国会図書館からアクセス制限の応答がありました。しばらく待って再度お試しください。",
  "NDL-REDIRECT": "国会図書館から転送の応答があり、取得を完了できませんでした。",
  "NDL-TIMEOUT": "国会図書館からの応答待ちが時間切れになりました。再度検索してください。",
  "NDL-NETWORK": "中継APIから国会図書館への通信に失敗しました。再度検索してください。",
  "NDL-TOO-LARGE": "国会図書館の応答が大きすぎるため、取得を中断しました。",
  "NDL-INVALID-RESPONSE": "国会図書館の応答を読み取れませんでした。再度検索してください。",
  "RELAY-400": "中継APIがISBNを受け付けませんでした。入力内容を確認してください。",
  "RELAY-403": "このアプリから中継APIへのアクセスが許可されていません。公開URLの設定確認が必要です。",
  "RELAY-404": "書誌検索の中継APIが見つかりませんでした。検索先の設定確認が必要です。",
  "RELAY-405": "中継APIが検索の通信方法を受け付けませんでした。",
  "RELAY-429": "中継APIで検索が混み合っています。少し待って再度お試しください。",
  "RELAY-INTERNAL": "中継APIの処理中にエラーが発生しました。",
  "RELAY-UNKNOWN": "中継APIからエラーが返されましたが、詳細を確認できませんでした。",
  "APP-TIMEOUT": "書誌検索全体の待ち時間が上限に達しました。通信や中継APIの待ち時間が原因の可能性があります。",
  "APP-CONNECTION": "中継APIへ接続できませんでした。通信状態、アクセス許可、検索先の設定を確認してください。",
  "APP-CONFIG": "書誌検索先が設定されていないか、設定が不正です。"
};
  function errorText(code){
    let text=errorMessages[code];
    if(!text && /^NDL-[1-5][0-9]{2}$/.test(code)) text=/^NDL-5/.test(code) ? '国会図書館からサーバーエラーが返されました。時間を置いて再度お試しください。' : '国会図書館から想定外の応答が返されました。';
    if(!text && /^RELAY-5[0-9]{2}$/.test(code)) text='中継サービスからエラーが返されました。時間を置いて再度お試しください。';
    if(!text){code='RELAY-UNKNOWN';text=errorMessages[code];}
    return text+'【'+code+'】';
  }
  async function responseError(response){
    let data;
    try {data=JSON.parse(await response.text());} catch(error){if(error.name==='AbortError' || error instanceof TypeError) throw error;}
    const code=data?.error?.code;
    if(typeof code==='string' && /^(NDL|RELAY)-/.test(code) && (Object.hasOwn(errorMessages,code) || /^(NDL-[1-5]|RELAY-5)[0-9]{2}$/.test(code))) return errorText(code);
    if([400,403,404,405,429].includes(response.status) || response.status>=500 && response.status<=599) return errorText('RELAY-'+response.status);
    return errorText('RELAY-UNKNOWN');
  }
  return {text:errorText,response:responseError};
})();
