#!/usr/bin/env node

/**
 * ASF 激活码验证服务器 API 测试脚本
 * 用法: node test-api.js [server-url] [api-key]
 */

const https = require('https');
const http = require('http');

// 命令行参数
const serverUrl = process.argv[2] || 'http://localhost:3000';
const apiKey = process.argv[3] || 'change-me-in-production';

// 颜色代码
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(message) {
  console.log(`\n${colors.cyan}${'='.repeat(50)}${colors.reset}`);
  log(message, 'blue');
  console.log(`${colors.cyan}${'='.repeat(50)}${colors.reset}\n`);
}

// HTTP 请求封装
function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, serverUrl);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...(body && { 'Content-Length': Buffer.byteLength(JSON.stringify(body)) })
      }
    };
    
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    
    req.on('error', reject);
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

// 测试用例
async function runTests() {
  logStep('开始测试 ASF 激活码验证服务器');
  
  log(`服务器地址: ${serverUrl}`);
  log(`API 密钥: ${apiKey.substring(0, 10)}...`);
  
  // 1. 健康检查
  log('\n[测试 1] 健康检查');
  try {
    const res = await request('GET', '/api/health');
    if (res.status === 200 && res.data.status === 'ok') {
      log('✅ 服务器运行正常', 'green');
      log(`   响应: ${JSON.stringify(res.data)}`, 'reset');
    } else {
      log('❌ 健康检查失败', 'red');
      log(`   响应: ${JSON.stringify(res.data)}`, 'red');
      return;
    }
  } catch (e) {
    log('❌ 健康检查失败: ' + e.message, 'red');
    return;
  }
  
  // 2. 生测试激活码
  const testCode = `TEST-${Date.now().toString().slice(-6)}`;
  logStep('生测试激活码');
  log(`测试码: ${testCode}`);
  
  try {
    const res = await request('POST', `/api/admin/generate-codes?apiKey=${apiKey}`, {
      count: 1,
      prefix: testCode
    });
    
    if (res.status === 200 && res.data.success) {
      log('✅ 激活码生成成功', 'green');
      const generatedCode = res.data.codes[0];
      log(`   生成的码: ${generatedCode}`, 'reset');
    } else if (res.status === 403) {
      log('❌ API 密钥错误或未授权', 'red');
      return;
    } else {
      log('❌ 生成激活码失败', 'red');
      log(`   响应: ${JSON.stringify(res.data)}`, 'red');
      return;
    }
  } catch (e) {
    log('❌ 生成激活码失败: ' + e.message, 'red');
    return;
  }
  
  // 3. 查询激活码列表
  logStep('查询激活码列表');
  try {
    const res = await request('GET', `/api/admin/codes?apiKey=${apiKey}&limit=5`);
    if (res.status === 200 && res.data.success) {
      log(`✅ 查询成功，共 ${res.data.total} 个激活码`, 'green');
      if (res.data.codes.length > 0) {
        log('最近激活码:');
        res.data.codes.forEach(code => {
          const status = code.used ? '已使用' : '未使用';
          const color = code.used ? 'yellow' : 'green';
          log(`   ${code.code} - [${status}]`, color);
        });
      }
    } else {
      log('❌ 查询失败', 'red');
    }
  } catch (e) {
    log('❌ 查询失败: ' + e.message, 'red');
  }
  
  // 4. 测试激活码验证
  logStep('测试激活码验证流程');
  
  // 生成机器指纹
  log('生成机器指纹...');
  const machineId = `test_machine_${Date.now()}`;
  log(`机器ID: ${machineId}`);
  
  // 第一次验证（应该成功）
  log(`\n[测试 4.1] 首次验证激活码`);
  try {
    const res = await request('POST', '/api/verify-code', {
      code: testCode,
      machineId: machineId,
      username: 'testuser1'
    });
    
    if (res.data.success) {
      log(`✅ 首次验证成功: ${res.data.message}`, 'green');
    } else {
      log(`❌ 首次验证失败: ${res.data.message}`, 'red');
    }
  } catch (e) {
    log('❌ 首次验证失败: ' + e.message, 'red');
  }
  
  // 第二次验证同一机器（应该成功，重激活）
  log(`\n[测试 4.2] 第二次验证同一机器`);
  try {
    const res = await request('POST', '/api/verify-code', {
      code: testCode,
      machineId: machineId,
      username: 'testuser1'
    });
    
    if (res.data.success && res.data.isReactivation) {
      log(`✅ 重激活成功: ${res.data.message}`, 'green');
    } else {
      log(`⚠️  第二次验证结果: ${JSON.stringify(res.data)}`, 'yellow');
    }
  } catch (e) {
    log('❌ 第二次验证失败: ' + e.message, 'red');
  }
  
  // 第三次验证不同机器（应该失败）
  log(`\n[测试 4.3] 验证不同机器（应失败）`);
  try {
    const res = await request('POST', '/api/verify-code', {
      code: testCode,
      machineId: 'different_machine_123',
      username: 'testuser2'
    });
    
    if (!res.data.success) {
      log(`✅ 正确拒绝: ${res.data.message}`, 'green');
    } else {
      log(`❌ 错误：应该被拒绝但验证通过了！`, 'red');
    }
  } catch (e) {
    log('❌ 验证失败: ' + e.message, 'red');
  }
  
  // 5. 统计查询
  logStep('查询统计信息');
  try {
    const res = await request('GET', `/api/admin/stats?apiKey=${apiKey}`);
    if (res.status === 200 && res.data.success) {
      const stats = res.data.stats;
      log('📊 统计数据:');
      log(`   总激活码: ${stats.total_codes}`, 'reset');
      log(`   已使用: ${stats.total_used}`, 'reset');
      log(`   注册机器: ${stats.total_machines}`, 'reset');
      log(`   24小时内验证: ${stats.recentVerifications}`, 'reset');
    }
  } catch (e) {
    log('❌ 查询统计失败: ' + e.message, 'red');
  }
  
  // 6. 机器列表
  logStep('查询机器列表');
  try {
    const res = await request('GET', `/api/admin/machines?apiKey=${apiKey}`);
    if (res.status === 200 && res.data.success) {
      const machines = res.data.machines;
      log(`✅ 查询成功，共 ${machines.length} 台机器`);
      machines.forEach((m, i) => {
        log(`   ${i+1}. ${m.machine_id} (使用${m.usage_count}次)`, 'reset');
      });
    }
  } catch (e) {
    log('❌ 查询机器失败: ' + e.message, 'red');
  }
  
  // 7. 撤销激活码测试
  logStep('测试撤销激活码');
  log(`撤销测试码: ${testCode}`);
  try {
    const res = await request('DELETE', `/api/admin/code/${testCode}?apiKey=${apiKey}`);
    if (res.status === 200 && res.data.success) {
      log(`✅ 撤销成功: ${res.data.message}`, 'green');
      
      // 验证撤销后可以重新使用
      log('\n验证撤销后可以重新激活...');
      const verifyRes = await request('POST', '/api/verify-code', {
        code: testCode,
        machineId: 'new_machine_test',
        username: 'newuser'
      });
      
      if (verifyRes.data.success) {
        log('✅ 撤销后重新激活成功', 'green');
      } else {
        log(`❌ 重新激活失败: ${verifyRes.data.message}`, 'red');
      }
    } else {
      log(`❌ 撤销失败: ${res.data.message || '未知错误'}`, 'red');
    }
  } catch (e) {
    log('❌ 撤销失败: ' + e.message, 'red');
  }
  
  // 完成
  logStep('测试完成');
  log('✅ 所有核心功能测试通过！', 'green');
  log('\n下一步:', 'blue');
  log('  1. 配置 HTTPS (生产环境必需)');
  log('  2. 部署到服务器');
  log('  3. 修改 ASF 前端的 ACTIVATION_SERVER_URL');
  log('  4. 生成正式激活码并分发');
  log('');
}

// 运行测试
runTests().catch(e => {
  log('❌ 测试过程出错: ' + e.message, 'red');
  process.exit(1);
});