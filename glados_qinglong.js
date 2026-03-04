/**
 * GlaDOS 青龙面板签到脚本
 * cron: 0 8 * * *
 */

const axios = require('axios');

const COOKIES = process.env.GR_COOKIE
  ? process.env.GR_COOKIE.split('&')
  : [];

const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN || '';
const TG_CHAT_ID = process.env.TG_CHAT_ID || '';
const DOMAIN = process.env.DOMAIN || 'glados.cloud';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

async function checkin(cookie) {
  const headers = {
    cookie,
    referer: 'https://glados.cloud/console/checkin',
    origin: 'https://glados.cloud',
    'user-agent': UA,
    'content-type': 'application/json;charset=UTF-8'
  };

  const checkinRes = await axios.post(
    'https://glados.cloud/api/user/checkin',
    { token: 'glados.cloud' },
    { headers }
  );

  const statusRes = await axios.get(
    'https://glados.cloud/api/user/status',
    { headers }
  );

  const leftDays = String(statusRes.data.data.leftDays).split('.')[0];

  return {
    email: statusRes.data.data.email,
    message: checkinRes.data.message,
    leftDays
  };
}

async function run() {
  if (!COOKIES.length) {
    console.log('❌ 未配置 GR_COOKIE');
    return;
  }

  let msg = '';

  for (const cookie of COOKIES) {
    try {
      const res = await checkin(cookie);
      msg +=
        `📧 ${mask(res.email)}\n` +
        `🎉 ${res.message}\n` +
        `⏳ 剩余天数：${res.leftDays}\n\n`;
    } catch (e) {
      msg += `❌ 签到失败：${e.message}\n\n`;
    }
  }

  console.log(msg);
  await sendTG(msg);
}

async function sendTG(text) {
  if (!TG_BOT_TOKEN || !TG_CHAT_ID) return;

  await axios.post(
    `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`,
    {
      chat_id: TG_CHAT_ID,
      text:
        `🕒 ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n` +
        `🌐 机场：${mask(DOMAIN)}\n\n` +
        text
    }
  );
}

function mask(str, s = 2, e = 2) {
  if (!str || str.length <= s + e) return str;
  return str.slice(0, s) + '****' + str.slice(-e);
}

run();
