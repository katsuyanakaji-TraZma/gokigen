/**
 * 行きたい場所マップの写真を Wikimedia Commons から1枚ずつ拾ってくる
 *   （node tools/fetch-place-photos.js）
 *
 * なぜGASでやらないか：
 *   ・runNow は1日4回まわる。50か所ぶんの外部リクエストを毎回足すと、
 *     前に一度ぶつかった「6分の実行制限」にまた近づく。
 *   ・写真は場所が増えたときしか変わらない。毎回取りにいく必要がない。
 * そこで **手で1回まわす node スクリプト**にして、結果を places-photos.json に置き、
 * places.html 側で台帳とつき合わせる。**台帳への書き戻しはしない。**
 *
 * 台帳の「写真URL」に値が入っていれば、そちらが always 優先（差し替え用）。
 * ここで拾えなかった場所は、ページ側でグレーのプレースホルダー（地名を大きく表示）になる。
 *
 * 場所を足したら：
 *   1. 台帳に行を足す → runNow で data.json に入る
 *   2. node tools/fetch-place-photos.js を1回まわす（既に写真のある場所は飛ばす）
 *   3. places-photos.json をコミットして push
 *
 * Commons の画像は自由に使えるライセンスだが、作者表示が要るものが多い。
 * artist / license も一緒に持ち帰って、ページの下に小さく出す。
 */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const OUT = path.join(root, "places-photos.json");
const API = "https://commons.wikimedia.org/w/api.php";
const UA = "GOKIGEN-OS/1.7 (personal family map; contact via github.com/katsuyanakaji-TraZma/gokigen)";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const strip = s => String(s || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

/** 地名から検索語の候補をいくつか作る。上から順に試して、最初に当たったものを採る */
function queries(p) {
  const name = String(p.name || "");
  const base = name.replace(/[（(].*?[)）]/g, "").trim();          // かっこ書きを外した本体
  const inner = (name.match(/[（(](.+?)[)）]/) || [])[1] || "";     // かっこの中（例「美瑛」）
  const head = base.split(/[・]/)[0];                              // 中黒の前（例「十二湖」）
  const area = String(p.area || "").split(/[・]/).pop();           // 「東北・青森」→「青森」
  const q = [];
  const add = x => { x = String(x || "").trim(); if (x && q.indexOf(x) < 0) q.push(x); };
  if (p.enq) p.enq.forEach(add);          // 手で入れた英語などの検索語（下の HINTS）を最優先
  add(base);
  if (inner) add(inner + " " + head);
  if (head !== base) add(head);
  if (area) add(head + " " + area);
  return q;
}

/**
 * Commons は英語で名前が付いている写真が圧倒的に多い。
 * 日本語名だけで引くと、当たらないか、まるで違う写真（「台湾」でフランスの峡谷、
 * 「オーロラ」で3か所とも同じ南極の写真）を掴む。so **英語名を第一候補にする**。
 * 場所を足したらここに1行足すこと。空欄でも動く（日本語名と座標で探す）。
 */
const HINTS = {
  "朝霧ジャンボリーオートキャンプ場": ["Asagiri Plateau Mount Fuji", "Mount Fuji from Fujinomiya"],
  "小田急山中湖フォレストコテージ": ["Lake Yamanaka Mount Fuji"],
  "ふもとっぱらキャンプ場": ["Fumotoppara Mount Fuji"],
  "浩庵キャンプ場(本栖湖)": ["Lake Motosu Mount Fuji"],
  "朝霧フィールドドッグスガーデン": ["Asagiri Kogen grassland Mount Fuji", "Fujinomiya Mount Fuji meadow"],
  "宗谷岬": ["Cape Soya"],
  "納沙布岬": ["Cape Nosappu"],
  "知床五湖": ["Shiretoko Five Lakes"],
  "青い池(美瑛)": ["Shirogane Blue Pond Biei"],
  "ファーム富田(富良野)": ["Farm Tomita Furano lavender"],
  "神威岬(積丹)": ["Cape Kamui Shakotan"],
  "函館山夜景": ["Mount Hakodate night view"],
  "釧路湿原": ["Kushiro Shitsugen National Park marsh", "Kushiro marshland"],
  "十二湖・青池(白神山地)": ["Aoike Juniko Shirakami"],
  "蔦沼": ["Tsuta-numa", "Tsutanuma Aomori"],
  "弘前公園": ["Hirosaki Castle cherry blossom"],
  "松島": ["Matsushima Miyagi"],
  "銀山温泉": ["Ginzan Onsen"],
  "十和田湖": ["Lake Towada"],
  "祖谷のかずら橋": ["Iya Kazurabashi vine bridge"],
  "鳴門の渦潮": ["Naruto whirlpools"],
  "四万十川": ["Shimanto River"],
  "仁淀川": ["Niyodo River"],
  "四国カルスト": ["Shikoku Karst"],
  "父母ヶ浜": ["Chichibugahama Mitoyo"],
  "寒霞渓(小豆島)": ["Kankakei Shodoshima"],
  "道後温泉": ["Dogo Onsen"],
  "阿蘇・大観峰": ["Daikanbo Aso"],
  "屋久島・白谷雲水峡": ["Shiratani Unsuikyo Yakushima"],
  "開聞岳": ["Mount Kaimon"],
  "由布院・別府": ["Kinrinko Yufuin", "Mount Yufu Yufuin"],
  "九重夢大吊橋": ["Kokonoe Yume Otsurihashi"],
  "高千穂峡": ["Takachiho Gorge"],
  "古宇利島・古宇利大橋": ["Kouri Bridge Okinawa"],
  "万座毛": ["Manzamo Okinawa"],
  "波照間島・ニシ浜": ["Hateruma Nishihama beach"],
  "与那国島": ["Cape Irizaki Yonaguni", "Yonaguni island coast"],
  "竹富島": ["Taketomi island"],
  "南極クルーズ(ウシュアイア発)": ["Antarctic Peninsula iceberg penguins", "Antarctica landscape"],
  "北極・スバールバル": ["Svalbard landscape", "Spitsbergen glacier"],
  "ウユニ塩湖": ["Salar de Uyuni"],
  "グランドキャニオン": ["Grand Canyon"],
  "オーロラ(フィンランド・ロヴァニエミ)": ["Aurora borealis Rovaniemi", "Northern lights Lapland Finland"],
  "オーロラ(アイスランド)": ["Northern lights Kirkjufell Iceland", "Aurora borealis Iceland landscape"],
  "オーロラ(カナダ・イエローナイフ)": ["Aurora borealis Yellowknife"],
  "インド・タージマハル(ゴールデントライアングル)": ["Taj Mahal Agra"],
  "ホノルルマラソン": ["Honolulu Marathon"],
  "台湾(九份・太魯閣・日月潭)": ["Jiufen Taiwan", "Taroko Gorge Taiwan"],
  "スイスアルプス・ユングフラウ": ["Jungfraujoch", "Eiger Monch Jungfrau panorama"],
  "イタリア・ドロミテ": ["Dolomites Tre Cime"]
};

/* Commons は無記名だと1秒1回くらいが上限。速く回すと 429 で全部落ちる
   （最初の試行はそれで36件が「見つからず」になった）。待って、断られたら待ち直す。 */
const GAP = 1100;
async function jget(params) {
  const url = API + "?" + new URLSearchParams(Object.assign({ format: "json" }, params));
  for (let try_ = 0; try_ < 4; try_++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } });
    if (res.ok) return res.json();
    if (res.status !== 429) throw new Error("HTTP " + res.status);
    await sleep(2500 * (try_ + 1));                 // 断られたら間を空けて出直す
  }
  throw new Error("HTTP 429（4回試してもだめ）");
}

/** 1枚ぶんの候補にそろえる。横長・大きい・地図やロゴでないものだけ通す */
function toCand(pg) {
  const ii = (pg.imageinfo || [])[0];
  if (!ii) return null;
  const t = String(pg.title || "");
  if (!/\.(jpe?g|png)$/i.test(t)) return null;                    // svg・pdf・音声は除く
  if (/(map|地図|logo|icon|coat of arms|flag|diagram|plaque|signboard|案内板)/i.test(t)) return null;
  // 絵画・版画・古地図をはじく（「Jungfrau」で19世紀の油絵を掴んだため）
  if (/(painting|oil on canvas|lithograph|engraving|woodblock|drawing|18\d\d|19[0-4]\d)/i.test(t)) return null;
  // 駅舎・道の駅・インターチェンジをはじく（「釧路湿原」で駅の写真を掴んだため）
  if (/(-STA\.|station|Michinoeki|道の駅|interchange|parking)/i.test(t)) return null;
  if (!ii.width || !ii.height) return null;
  if (ii.width / ii.height < 1.15) return null;                   // 横長だけ（16:9のタイルに使う）
  if (ii.width < 900) return null;
  const em = ii.extmetadata || {};
  return {
    title: t.replace(/^File:/, ""),
    url: ii.thumburl || ii.url,
    full: ii.descriptionurl || null,
    w: ii.thumbwidth || ii.width, h: ii.thumbheight || ii.height,
    artist: strip((em.Artist || {}).value).slice(0, 80) || null,
    license: strip((em.LicenseShortName || {}).value) || null,
    score: (pg.index != null ? -pg.index : 0)                     // 検索の並び順を尊重する
  };
}

/** 検索語1つで Commons を引き、横長で大きい写真の候補を返す */
async function search(term) {
  const j = await jget({
    action: "query", generator: "search",
    gsrsearch: term, gsrnamespace: 6, gsrlimit: 12,       // namespace 6 = File:
    prop: "imageinfo", iiprop: "url|size|extmetadata", iiurlwidth: 1200
  });
  const cands = Object.values((j.query && j.query.pages) || {}).map(toCand).filter(Boolean);
  cands.sort((a, b) => b.score - a.score);
  return cands;
}

/** 緯度経度のまわりに貼られている写真を探す（名前で当たらない場所の保険） */
async function nearby(lat, lng, radius) {
  const j = await jget({
    action: "query", generator: "geosearch",
    ggscoord: lat + "|" + lng, ggsradius: radius, ggsnamespace: 6, ggslimit: 30,
    prop: "imageinfo", iiprop: "url|size|extmetadata", iiurlwidth: 1200
  });
  const cands = Object.values((j.query && j.query.pages) || {}).map(toCand).filter(Boolean);
  cands.sort((a, b) => b.w * b.h - a.w * a.h);          // 近所ぶんは大きいものを上に
  return cands;
}

(async () => {
  const dataPath = path.join(root, "data.json");
  const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  let rows = ((data.places || {}).rows) || [];
  if (!rows.length) {
    // data.json にまだ places が無いとき用（GASを回す前でも動かせるように）
    const seed = path.join(__dirname, "places-seed.json");
    if (fs.existsSync(seed)) rows = JSON.parse(fs.readFileSync(seed, "utf8"));
  }
  if (!rows.length) { console.error("places がありません。先に runNow を回すか tools/places-seed.json を置いてください"); process.exit(1); }

  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { photos: {} };
  const photos = prev.photos || {};
  let got = 0, kept = 0, miss = [];
  /* 同じ写真を2か所で使わない。
     「オーロラ」でまとめて引くと3か所とも同じ写真になり、見た目が壊れる。 */
  const used = new Set(Object.values(photos).map(x => x && x.url).filter(Boolean));
  const pick = cands => cands.filter(c => !used.has(c.url))[0] || null;

  for (const p0 of rows) {
    const p = Object.assign({}, p0, { enq: HINTS[p0.name] });
    if (p.photo) { continue; }                       // 台帳に写真があるので取りにいかない
    if (photos[p.name] && photos[p.name].url) { kept++; got++; continue; }   // 取得ずみ
    let hit = null;
    for (const q of queries(p)) {                    // ①英語名 → ②日本語名 の順で探す
      try { hit = pick(await search(q)); } catch (e) { console.error("  ! " + q + " : " + e.message); }
      await sleep(GAP);
      if (hit) { hit.query = q; break; }
    }
    if (!hit && p.lat != null && p.lng != null) {    // ③名前で出なければ、その座標のまわりから
      for (const r of [3000, 12000]) {
        try { hit = pick(await nearby(p.lat, p.lng, r)); }
        catch (e) { console.error("  ! geo " + r + "m : " + e.message); }
        await sleep(GAP);
        if (hit) { hit.query = "座標から半径" + (r / 1000) + "km"; break; }
      }
    }
    if (hit) { used.add(hit.url); photos[p.name] = hit; got++;
      console.log("✅ " + p.name + "  ← " + hit.query + "  / " + hit.title.slice(0, 52)); }
    else { miss.push(p.name); console.log("⬜ " + p.name + "  （見つからず→プレースホルダー）"); }
  }

  const out = { source: "Wikimedia Commons", fetchedAt: new Date().toISOString().slice(0, 10),
                count: Object.keys(photos).length, photos };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log("\n取得: " + got + " / " + rows.length + " 件（うち前回ぶんの流用 " + kept + "）");
  if (miss.length) console.log("見つからなかった場所（HINTS に英語名などを足すと拾えます）:\n  " + miss.join("\n  "));
  console.log("→ " + OUT);
})();
