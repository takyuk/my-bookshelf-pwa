// Accept only known Amazon Japan product links; never fetch arbitrary shared URLs.
const KindleShare = {
  parse({title = '', text = '', url = ''}) {
    const content = [title, text, url].join('\n');
    if (content.length > 16000) throw new Error('共有テキストが長すぎます。');
    const asins = new Set();
    for (const raw of content.match(/https:\/\/[^\s<>"）)]+/g) || []) {
      let link;
      try { link = new URL(raw); } catch { continue; }
      if (link.username || link.password || link.port) continue;
      let asin;
      if (link.hostname === 'read.amazon.co.jp' && link.pathname === '/kp/kshare') asin = link.searchParams.get('asin');
      if (['amazon.co.jp', 'www.amazon.co.jp'].includes(link.hostname)) asin = link.pathname.match(/\/(?:dp|gp\/product)\/([A-Za-z0-9]{10})(?:\/|$)/)?.[1];
      const normalized = BookISBN.asin(asin);
      if (normalized) asins.add(normalized);
    }
    if (asins.size !== 1) throw new Error('Kindleの共有リンクを1冊分受け取れませんでした。Kindleアプリから共有し直してください。');
    const match = content.match(/["“]([^\n]+?)["”]\s*[（(]([^\n]+?)\s+著[）)]/);
    return {asin:[...asins][0], title:match?.[1].trim() || '', author:match?.[2].split(/[;；]/).map(s => s.trim()).filter(Boolean).join('、') || ''};
  }
};
if (typeof module !== 'undefined') module.exports = KindleShare;
if (typeof document !== 'undefined') (() => {
  const params = new URL(location.href).searchParams;
  // Android GET share targets replace the action's query with shared parameters.
  // Keep accepting the old marker, but do not require it to survive OS dispatch.
  if (params.get('share') !== 'kindle' && !['title','text','url'].some(key => params.has(key))) return;
  const notice = document.getElementById('kindleShareNotice');
  const message = document.getElementById('kindleShareMessage');
  const button = document.getElementById('openKindleShare');
  let pending;
  notice.hidden = false;
  try {
    pending = KindleShare.parse(Object.fromEntries(['title','text','url'].map(key => [key, params.get(key) || ''])));
    message.textContent = 'Kindleから共有された本を受け取りました。内容を確認して保存してください。';
  } catch (error) { message.textContent = error.message; button.hidden = true; }
  function open() {
    if (!pending || !Terms.allowed() || !editor.importKindle(pending)) return;
    pending = null;
    notice.hidden = true;
    history.replaceState(null, '', location.pathname);
  }
  button.addEventListener('click', open);
  document.addEventListener('bookshelf-consent', open);
  open();
})();
