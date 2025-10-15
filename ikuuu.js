const DEFAULT_CONFIG = {
  DOMAIN: 'https://ikuuu.org',
  ACCOUNTS: [],  // 改为账户数组（格式："email1&password1&email2&password2"）
  TRIGGER_PATH: '/auto-checkin',
  TG_BOT_TOKEN: '',
  TG_CHAT_ID: '',
  MAX_RETRY: 3
};

let config = { ...DEFAULT_CONFIG };

export default {
  async fetch(request, env, ctx) {
    await initializeConfig(env);
    const url = new URL(request.url);
    
    if (url.pathname === config.TRIGGER_PATH) {
      try {
        const results = await checkAllAccounts();
        await sendTelegramNotification(`✅ 自动签到完成\n${results.join('\n')}`);
        return successResponse(results.join('\n'));
      } catch (error) {
        await sendTelegramNotification(`❌ 自动签到失败\n${error.message}`);
        return errorResponse(error);
      }
    }
    else if (url.pathname === '/') {
      return new Response(
        `请访问 ${config.TRIGGER_PATH} 触发签到`,
        { 
          status: 200,
          headers: { 
            'Content-Type': 'text/plain; charset=UTF-8',
            'X-Content-Type-Options': 'nosniff'
          }
        }
      );
    }    
    return new Response('Not Found', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    await initializeConfig(env);
    console.log('Cron job started at:', new Date().toISOString());
    
    try {
      const results = await checkAllAccounts();
      console.log('Cron job succeeded:', results);
      await sendTelegramNotification(`✅ 定时签到完成\n${results.join('\n')}`);
    } catch (error) {
      console.error('Cron job failed:', error);
      await sendTelegramNotification(`❌ 定时签到失败\n${error.message}`);
    }
  }
};

async function initializeConfig(env) {
  config = {
    DOMAIN: env.DOMAIN || config.DOMAIN,
    ACCOUNTS: env.ACCOUNTS ? env.ACCOUNTS.split('&').reduce((acc, cur, i, arr) => {
      if (i % 2 === 0) acc.push({ email: cur, password: arr[i + 1] });
      return acc;
    }, []) : config.ACCOUNTS,
    TRIGGER_PATH: env.TRIGGER_PATH || config.TRIGGER_PATH,
    TG_BOT_TOKEN: env.TG_BOT_TOKEN || config.TG_BOT_TOKEN,
    TG_CHAT_ID: env.TG_CHAT_ID || config.TG_CHAT_ID,
    MAX_RETRY: env.MAX_RETRY ? parseInt(env.MAX_RETRY) : config.MAX_RETRY
  };
}

async function checkAllAccounts() {
  if (!config.ACCOUNTS.length) throw new Error('未配置签到账户');

  const results = [];
  for (const account of config.ACCOUNTS) {
    try {
      const result = await withRetry(() => checkin(account), config.MAX_RETRY);
      results.push(`📧 ${maskString(account.email)} 签到成功：${result}`);
    } catch (error) {
      results.push(`❌ ${maskString(account.email)} 签到失败：${error.message}`);
    }
  }
  return results;
}

async function checkin(account) {
  try {
    console.log(`[${account.email}] 进行登录...`);
    
    const loginResponse = await fetch(`${config.DOMAIN}/auth/login`, {
      method: 'POST',
      headers: createHeaders('login'),
      body: JSON.stringify({ email: account.email, passwd: account.password })
    });
    
    const loginResult = await loginResponse.json();
    console.log(loginResult.msg);
    
    const cookies = parseCookies(loginResponse.headers.get('set-cookie'));
    await delay(1000);
    
    const checkinResponse = await fetch(`${config.DOMAIN}/user/checkin`, {
      method: 'POST',
      headers: { ...createHeaders('checkin'), Cookie: cookies }
    });
    
    const checkinResult = await checkinResponse.json();
    console.log(checkinResult.msg);
    return checkinResult.msg;
  } catch (error) {
    console.error('签到失败:', error);
    throw new Error('签到失败');
  }
}

async function sendTelegramNotification(message) {
  if (!config.TG_BOT_TOKEN || !config.TG_CHAT_ID) return;

  const timeString = new Date().toLocaleString('zh-CN', { 
    timeZone: 'Asia/Shanghai',
    hour12: false 
  });

  const payload = {
    chat_id: config.TG_CHAT_ID,
    text: `🕒 执行时间: ${timeString}\n` +
          `🌐 机场地址: ${maskString(config.DOMAIN)}\n` +
          `📥 签到账户数: ${config.ACCOUNTS.length}\n\n` +
          `${Array.isArray(message) ? message.join('\n') : message}`,
    parse_mode: 'HTML',
    disable_web_page_preview: true
  };

  const telegramAPI = `https://api.telegram.org/bot${config.TG_BOT_TOKEN}/sendMessage`;
  
  try {
    const response = await fetch(telegramAPI, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      console.error('Telegram通知失败:', await response.text());
    }
  } catch (error) {
    console.error('Telegram通知异常:', error);
  }
}

function maskString(str, visibleStart = 2, visibleEnd = 2) {
  if (!str) return '';
  if (str.length <= visibleStart + visibleEnd) return str;
  return `${str.substring(0, visibleStart)}****${str.substring(str.length - visibleEnd)}`;
}

function createHeaders(type = 'default') {
  const common = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Origin': config.DOMAIN
  };

  return {
    login: { ...common, 'Content-Type': 'application/json', 'Referer': `${config.DOMAIN}/auth/login` },
    checkin: { ...common, 'Referer': `${config.DOMAIN}/user/panel`, 'X-Requested-With': 'XMLHttpRequest' }
  }[type] || common;
}

function parseCookies(cookieHeader) {
  return (cookieHeader || '').split(',').map(c => c.split(';')[0].trim()).join('; ');
}

async function withRetry(fn, retries) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      await delay(2000 * (i + 1));
    }
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function successResponse(data) {
  return new Response(data, { status: 200, headers: { 'Content-Type': 'text/plain; charset=UTF-8' } });
}

function errorResponse(error) {
  return new Response(error.message, { status: 500, headers: { 'Content-Type': 'text/plain; charset=UTF-8' } });
}
