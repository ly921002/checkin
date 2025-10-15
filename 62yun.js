const DEFAULT_CONFIG = {
  DOMAIN: '69yun69.com',
  USERNAME: 'your_email@example.com',
  PASSWORD: 'your_password',
  TRIGGER_PATH: '/auto-checkin', // 自定义安全触发路径
  TG_BOT_TOKEN: '',
  TG_CHAT_ID: '',
  MAX_RETRY: 3
};

let config = { ...DEFAULT_CONFIG };
let signResult = '';

export default {
  async fetch(request, env, ctx) {
    await initializeConfig(env);
    const url = new URL(request.url);
    
    if (url.pathname === config.TRIGGER_PATH) {
      try {
        await checkin();
        return successResponse(signResult);
      } catch (error) {
        return errorResponse(error);
      }
    }
    // 新增根路径提示
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
      await withRetry(checkin, config.MAX_RETRY);
      console.log('Cron job succeeded:', signResult);
      await sendTelegramNotification(`✅ 自动签到成功\n${signResult}`);
    } catch (error) {
      console.error('Cron job failed:', error);
      await sendTelegramNotification(`❌ 自动签到失败\n${error.message}`);
    }
  }
};

async function initializeConfig(env) {
  config = {
    DOMAIN: env.DOMAIN || config.DOMAIN,
    USERNAME: env.USERNAME || config.USERNAME,
    PASSWORD: env.PASSWORD || config.PASSWORD,
    TRIGGER_PATH: env.TRIGGER_PATH || config.TRIGGER_PATH,
    TG_BOT_TOKEN: env.TG_BOT_TOKEN || config.TG_BOT_TOKEN,
    TG_CHAT_ID: env.TG_CHAT_ID || config.TG_CHAT_ID,
    MAX_RETRY: env.MAX_RETRY ? parseInt(env.MAX_RETRY) : config.MAX_RETRY
  };
  
  if (!config.DOMAIN.startsWith('http')) {
    config.DOMAIN = `https://${config.DOMAIN}`;
  }
}

async function checkin() {
  try {
    // Step 1: Login
    const loginResponse = await fetch(`${config.DOMAIN}/auth/login`, {
      method: 'POST',
      headers: createHeaders('login'),
      body: JSON.stringify({
        email: config.USERNAME,
        passwd: config.PASSWORD,
        remember_me: 'on'
      })
    });

    await validateResponse(loginResponse, '登录');

    const cookies = parseCookies(loginResponse.headers.get('set-cookie'));
    await delay(1000); // 等待登录状态生效

    // Step 2: Checkin
    const checkinResponse = await fetch(`${config.DOMAIN}/user/checkin`, {
      method: 'POST',
      headers: {
        ...createHeaders('checkin'),
        Cookie: cookies
      }
    });

    const result = await parseCheckinResponse(checkinResponse);
    signResult = `🎉 签到成功！\n${result.msg}\n剩余流量：${result.trafficInfo || '未知'}`;
    return result;

  } catch (error) {
    console.error('Checkin Failed:', error);
    signResult = `❌ 签到失败: ${error.message}`;
    throw error;
  }
}

// 辅助函数
function createHeaders(type = 'default') {
  const common = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Origin': config.DOMAIN
  };

  const types = {
    login: {
      ...common,
      'Content-Type': 'application/json',
      'Referer': `${config.DOMAIN}/auth/login`
    },
    checkin: {
      ...common,
      'Referer': `${config.DOMAIN}/user/panel`,
      'X-Requested-With': 'XMLHttpRequest'
    }
  };

  return types[type] || common;
}

async function parseCheckinResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`无效的响应格式: ${text.slice(0, 100)}...`);
  }
}

async function validateResponse(response, step) {
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${step}失败 (${response.status}): ${errorText}`);
  }
}

function parseCookies(cookieHeader) {
  return (cookieHeader || '')
    .split(',')
    .map(c => c.split(';')[0].trim())
    .join('; ');
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

async function sendTelegramNotification(message) {
  if (!config.TG_BOT_TOKEN || !config.TG_CHAT_ID) return;

  const timeString = new Date().toLocaleString('zh-CN', { 
    timeZone: 'Asia/Shanghai',
    hour12: false 
  });

  const payload = {
    chat_id: config.TG_CHAT_ID,
    text: `🕒 执行时间: ${timeString}\n\n` +
          `🌐 机场地址: ${maskString(config.DOMAIN)}\n` +
          `📧 账户邮箱: ${maskString(config.USERNAME)}\n\n` +
          `${message}`,
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

function successResponse(data) {
  return new Response(data, {
    status: 200,
    headers: { 
      'Content-Type': 'text/plain; charset=UTF-8',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function errorResponse(error) {
  return new Response(error.message, {
    status: 500,
    headers: {
      'Content-Type': 'text/plain; charset=UTF-8',
      'X-Error-Info': 'true'
    }
  });
}
