/**
 * 69yun 青龙面板签到脚本
 * cron: 0 9 * * *
 */

const axios = require('axios');

const DOMAIN = process.env.DOMAIN || 'https://69yun69.com';
const USERNAME = process.env.USERNAME;
const PASSWORD = process.env.PASSWORD;
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN || '';
const TG_CHAT_ID = process.env.TG_CHAT_ID || '';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

async function run() {
  try {
    const cookie = await login();
    const res = await checkin(cookie);

    const msg =
      `🎉 签到成功\n` +
      `${res.msg}\n` +
      `💾 剩余流量：${res.trafficInfo || '未知'}`;

    console.log(msg);
    await sendTG(msg);
  } catch (e) {
    console.log('❌ 签到失败：', e.message);
    await sendTG(`❌ 签到失败：${e.message}`);
  }
}

async function login() {
  const res = await axios.post(
    `${DOMAIN}/auth/login`,
    {
      email: USERNAME,
      passwd: PASSWORD,
      remember_me: 'on'
    },
    {
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/json',
        Origin: DOMAIN,
        Referer: `${DOMAIN}/auth/login`
      },
      validateStatus: () => true
    }
  );

  if (res.status !== 200) {
    throw new Error('登录失败');
  }

  return res.headers['set-cookie']
    .map(c => c.split(';')[0])
    .join('; ');
}

async function checkin(cookie) {
  const res = await axios.post(
    `${DOMAIN}/user/checkin`,
    {},
    {
      headers: {
        'User-Agent': UA,
        Cookie: cookie,
        Referer: `${DOMAIN}/user/panel`,
        'X-Requested-With': 'XMLHttpRequest'
      }
    }
  );
  return res.data;
}

async function sendTG(text) {
  if (!TG_BOT_TOKEN || !TG_CHAT_ID) return;

  await axios.post(
    `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`,
    {
      chat_id: TG_CHAT_ID,
      text:
        `🕒 ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n` +
        `🌐 ${mask(DOMAIN)}\n` +
        `📧 ${mask(USERNAME)}\n\n` +
        text
    }
  );
}

function mask(str, s = 2, e = 2) {
  if (!str || str.length <= s + e) return str;
  return str.slice(0, s) + '****' + str.slice(-e);
}

run();
