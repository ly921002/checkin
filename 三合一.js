// 统一配置对象
const CONFIG = {
  // 69yun配置
  SERVICE_69yun: {
    DOMAIN: '69yun69.com',
    USERNAME: '',
    PASSWORD: '',
    ENABLED: true
  },
  
  // GlaDOS配置
  SERVICE_GLADOS: {
    COOKIES: [],
    DOMAIN: 'glados.network',
    ENABLED: true
  },
  
  // ikuuu配置
  SERVICE_ikuuu: {
    DOMAIN: 'https://ikuuu.de',
    ACCOUNTS: [],
    ENABLED: true
  },
  
  // 通用配置
  COMMON: {
    TRIGGER_PATH: '/auto-checkin',
    TG_BOT_TOKEN: '',
    TG_CHAT_ID: '',
    MAX_RETRY: 3
  }
};

// 初始化配置
async function initializeConfig(env) {
  // 69yun配置
  CONFIG.SERVICE_69yun.DOMAIN = env['69yun_DOMAIN'] || CONFIG.SERVICE_69yun.DOMAIN;
  CONFIG.SERVICE_69yun.USERNAME = env['69yun_USERNAME'] || CONFIG.SERVICE_69yun.USERNAME;
  CONFIG.SERVICE_69yun.PASSWORD = env['69yun_PASSWORD'] || CONFIG.SERVICE_69yun.PASSWORD;
  CONFIG.SERVICE_69yun.ENABLED = env['69yun_ENABLED'] !== 'false';
  
  if (!CONFIG.SERVICE_69yun.DOMAIN.startsWith('http')) {
    CONFIG.SERVICE_69yun.DOMAIN = `https://${CONFIG.SERVICE_69yun.DOMAIN}`;
  }

  // GlaDOS配置
  CONFIG.SERVICE_GLADOS.COOKIES = env.GLADOS_COOKIES ? env.GLADOS_COOKIES.split('&') : CONFIG.SERVICE_GLADOS.COOKIES;
  CONFIG.SERVICE_GLADOS.DOMAIN = env.GLADOS_DOMAIN || CONFIG.SERVICE_GLADOS.DOMAIN;
  CONFIG.SERVICE_GLADOS.ENABLED = env.GLADOS_ENABLED !== 'false';

  // ikuuu配置
  CONFIG.SERVICE_ikuuu.DOMAIN = env['ikuuu_DOMAIN'] || CONFIG.SERVICE_ikuuu.DOMAIN;
  CONFIG.SERVICE_ikuuu.ACCOUNTS = env['ikuuu_ACCOUNTS'] ? env['ikuuu_ACCOUNTS'].split('&').reduce((acc, cur, i, arr) => {
    if (i % 2 === 0) acc.push({ email: cur, password: arr[i + 1] });
    return acc;
  }, []) : CONFIG.SERVICE_ikuuu.ACCOUNTS;
  CONFIG.SERVICE_ikuuu.ENABLED = env['ikuuu_ENABLED'] !== 'false';

  // 通用配置
  CONFIG.COMMON.TRIGGER_PATH = env.TRIGGER_PATH || CONFIG.COMMON.TRIGGER_PATH;
  CONFIG.COMMON.TG_BOT_TOKEN = env.TG_BOT_TOKEN || CONFIG.COMMON.TG_BOT_TOKEN;
  CONFIG.COMMON.TG_CHAT_ID = env.TG_CHAT_ID || CONFIG.COMMON.TG_CHAT_ID;
  CONFIG.COMMON.MAX_RETRY = env.MAX_RETRY ? parseInt(env.MAX_RETRY) : CONFIG.COMMON.MAX_RETRY;
}

// 69yun签到服务
async function service69yunCheckin() {
  if (!CONFIG.SERVICE_69yun.ENABLED) {
    return { success: false, message: '69yun签到已禁用' };
  }
  
  try {
    // Step 1: Login
    const loginResponse = await fetch(`${CONFIG.SERVICE_69yun.DOMAIN}/auth/login`, {
      method: 'POST',
      headers: createHeaders('login', CONFIG.SERVICE_69yun.DOMAIN),
      body: JSON.stringify({
        email: CONFIG.SERVICE_69yun.USERNAME,
        passwd: CONFIG.SERVICE_69yun.PASSWORD,
        remember_me: 'on'
      })
    });

    await validateResponse(loginResponse, '登录');
    const cookies = parseCookies(loginResponse.headers.get('set-cookie'));
    await delay(1000);

    // Step 2: Checkin
    const checkinResponse = await fetch(`${CONFIG.SERVICE_69yun.DOMAIN}/user/checkin`, {
      method: 'POST',
      headers: {
        ...createHeaders('checkin', CONFIG.SERVICE_69yun.DOMAIN),
        Cookie: cookies
      }
    });

    const result = await parseCheckinResponse(checkinResponse);
    return {
      success: true,
      message: `🎉 69yun签到成功！\n${result.msg}\n剩余流量：${result.trafficInfo || '未知'}`,
      service: '69yun',
      account: maskString(CONFIG.SERVICE_69yun.USERNAME)
    };
  } catch (error) {
    return {
      success: false,
      message: `❌ 69yun签到失败: ${error.message}`,
      service: '69yun',
      account: maskString(CONFIG.SERVICE_69yun.USERNAME)
    };
  }
}

// GlaDOS签到服务
async function serviceGladosCheckin() {
  if (!CONFIG.SERVICE_GLADOS.ENABLED || !CONFIG.SERVICE_GLADOS.COOKIES.length) {
    return { success: false, message: 'GlaDOS签到已禁用或无可用Cookie' };
  }
  
  const results = [];
  for (const cookie of CONFIG.SERVICE_GLADOS.COOKIES) {
    try {
      const checkin_url = "https://glados.rocks/api/user/checkin";
      const state_url = "https://glados.rocks/api/user/status";
      const referer = "https://glados.rocks/console/checkin";
      const origin = "https://glados.rocks";
      const payload = { token: "glados.one" };

      const checkinResponse = await fetch(checkin_url, {
        method: "POST",
        headers: {
          "cookie": cookie,
          "referer": referer,
          "origin": origin,
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.75 Safari/537.36",
          "content-type": "application/json;charset=UTF-8",
        },
        body: JSON.stringify(payload),
      });

      const stateResponse = await fetch(state_url, {
        method: "GET",
        headers: {
          "cookie": cookie,
          "referer": referer,
          "origin": origin,
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.75 Safari/537.36",
        },
      });

      const checkinData = await checkinResponse.json();
      const stateData = await stateResponse.json();
      let leftDays = stateData.data.leftDays;
      if (typeof leftDays !== "string") leftDays = String(leftDays);
      let remainTime = leftDays.split('.')[0];

      results.push({
        success: true,
        message: `🎉 GlaDOS签到成功\n结果：${checkinData.message}\n剩余天数：${remainTime}`,
        service: 'GlaDOS',
        account: maskString(stateData.data.email)
      });
    } catch (error) {
      results.push({
        success: false,
        message: `❌ GlaDOS签到失败: ${error.message}`,
        service: 'GlaDOS',
        account: '未知账户'
      });
    }
  }
  
  return results;
}

// ikuuu签到服务
async function serviceIkuuuCheckin() {
  if (!CONFIG.SERVICE_ikuuu.ENABLED || !CONFIG.SERVICE_ikuuu.ACCOUNTS.length) {
    return { success: false, message: 'ikuuu签到已禁用或无可用账户' };
  }
  
  const results = [];
  for (const account of CONFIG.SERVICE_ikuuu.ACCOUNTS) {
    try {
      const loginResponse = await fetch(`${CONFIG.SERVICE_ikuuu.DOMAIN}/auth/login`, {
        method: 'POST',
        headers: createHeaders('login', CONFIG.SERVICE_ikuuu.DOMAIN),
        body: JSON.stringify({ email: account.email, passwd: account.password })
      });
      
      await validateResponse(loginResponse, '登录');
      const cookies = parseCookies(loginResponse.headers.get('set-cookie'));
      await delay(1000);
      
      const checkinResponse = await fetch(`${CONFIG.SERVICE_ikuuu.DOMAIN}/user/checkin`, {
        method: 'POST',
        headers: { 
          ...createHeaders('checkin', CONFIG.SERVICE_ikuuu.DOMAIN), 
          Cookie: cookies 
        }
      });
      
      const checkinResult = await checkinResponse.json();
      results.push({
        success: true,
        message: `🎉 ikuuu签到成功：${checkinResult.msg}`,
        service: 'ikuuu',
        account: maskString(account.email)
      });
    } catch (error) {
      results.push({
        success: false,
        message: `❌ ikuuu签到失败：${error.message}`,
        service: 'ikuuu',
        account: maskString(account.email)
      });
    }
  }
  
  return results;
}

// 主处理函数
export default {
  async fetch(request, env, ctx) {
    await initializeConfig(env);
    const url = new URL(request.url);
    
    if (url.pathname === CONFIG.COMMON.TRIGGER_PATH) {
      try {
        const results = await runAllCheckins();
        const responseText = formatResultsForResponse(results);
        await sendTelegramNotification(formatResultsForTelegram(results));
        return new Response(responseText, {
          status: 200,
          headers: { 
            'Content-Type': 'text/plain; charset=UTF-8',
            'X-Content-Type-Options': 'nosniff'
          }
        });
      } catch (error) {
        return new Response(`签到失败: ${error.message}`, {
          status: 500,
          headers: { 
            'Content-Type': 'text/plain; charset=UTF-8',
            'X-Error-Info': 'true'
          }
        });
      }
    }
    else if (url.pathname === '/') {
      return new Response(
        `请访问 ${CONFIG.COMMON.TRIGGER_PATH} 触发签到服务\n\n支持服务: 69yun, GlaDOS, ikuuu`,
        { 
          status: 200,
          headers: { 
            'Content-Type': 'text/plain; charset=UTF-8',
            'X-Content-Type-Options': 'nosniff'
          }
        }
      );
    }
    
    return new Response('Not Found', { 
      status: 404,
      headers: { 
        'Content-Type': 'text/plain; charset=UTF-8'
      }
    });
  },

  async scheduled(event, env, ctx) {
    await initializeConfig(env);
    console.log('定时签到任务开始:', new Date().toISOString());
    
    try {
      const results = await runAllCheckins();
      console.log('定时任务完成:', results);
      await sendTelegramNotification(formatResultsForTelegram(results));
    } catch (error) {
      console.error('定时任务失败:', error);
      await sendTelegramNotification(`❌ 自动签到失败\n${error.message}`);
    }
  }
};

// 执行所有签到任务
async function runAllCheckins() {
  const results = [];
  
  // 执行69yun签到
  if (CONFIG.SERVICE_69yun.ENABLED) {
    const result69yun = await service69yunCheckin();
    results.push(result69yun);
  }
  
  // 执行GlaDOS签到
  if (CONFIG.SERVICE_GLADOS.ENABLED) {
    const gladosResults = await serviceGladosCheckin();
    if (Array.isArray(gladosResults)) {
      results.push(...gladosResults);
    } else {
      results.push(gladosResults);
    }
  }
  
  // 执行ikuuu签到
  if (CONFIG.SERVICE_ikuuu.ENABLED) {
    const ikuuuResults = await serviceIkuuuCheckin();
    if (Array.isArray(ikuuuResults)) {
      results.push(...ikuuuResults);
    } else {
      results.push(ikuuuResults);
    }
  }
  
  return results;
}

// 辅助函数
function createHeaders(type = 'default', domain) {
  const common = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Origin': domain
  };

  return {
    login: { 
      ...common, 
      'Content-Type': 'application/json', 
      'Referer': `${domain}/auth/login` 
    },
    checkin: { 
      ...common, 
      'Referer': `${domain}/user/panel`, 
      'X-Requested-With': 'XMLHttpRequest' 
    }
  }[type] || common;
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
  return (cookieHeader || '').split(',').map(c => c.split(';')[0].trim()).join('; ');
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function maskString(str, visibleStart = 2, visibleEnd = 2) {
  if (!str) return '';
  if (str.length <= visibleStart + visibleEnd) return str;
  return `${str.substring(0, visibleStart)}****${str.substring(str.length - visibleEnd)}`;
}

// 格式化结果用于响应
function formatResultsForResponse(results) {
  if (!results.length) return '没有执行任何签到任务';
  
  const output = [];
  let successCount = 0;
  
  for (const result of results) {
    if (result.success) successCount++;
    output.push(`[${result.service}] ${result.account} - ${result.success ? '✅' : '❌'} ${result.message}`);
  }
  
  return `签到任务完成 (${successCount}/${results.length}成功):\n\n${output.join('\n\n')}`;
}

// 格式化结果用于Telegram通知
function formatResultsForTelegram(results) {
  if (!results.length) return '没有执行任何签到任务';
  
  const timeString = new Date().toLocaleString('zh-CN', { 
    timeZone: 'Asia/Shanghai',
    hour12: false 
  });
  
  let message = `🕒 <b>签到报告</b> - ${timeString}\n\n`;
  let successCount = 0;
  let totalCount = results.length;
  
  for (const result of results) {
    if (result.success) successCount++;
    message += `<b>${result.service}</b> (${result.account}):\n`;
    message += `${result.success ? '✅' : '❌'} ${result.message}\n\n`;
  }
  
  message += `📊 <b>汇总</b>: ${successCount}/${totalCount} 个任务成功\n`;
  
  return message;
}

// 发送Telegram通知
async function sendTelegramNotification(message) {
  if (!CONFIG.COMMON.TG_BOT_TOKEN || !CONFIG.COMMON.TG_CHAT_ID) return;
  
  const payload = {
    chat_id: CONFIG.COMMON.TG_CHAT_ID,
    text: message,
    parse_mode: 'HTML',
    disable_web_page_preview: true
  };
  
  const telegramAPI = `https://api.telegram.org/bot${CONFIG.COMMON.TG_BOT_TOKEN}/sendMessage`;
  
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
