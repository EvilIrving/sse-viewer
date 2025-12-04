// inject.js（主世界脚本，拦截 EventSource 和 fetch(text/event-stream)）
(function () {
  // 防止重复注入
  if (window.__sse_viewer_inject_installed) {
    console.warn('[SSE Viewer] Inject already installed, skipping');
    return;
  }
  window.__sse_viewer_inject_installed = true;

  function post(type, url, payload) {
    // 智能过滤：排除明显不是 SSE 流的请求
    // 但保留关键的 AI 对话请求
    const isAIChatRequest = url && (
      // Claude
      url.includes('chat_conversations') || url.includes('/chat/') ||
      // Grok
      url.includes('/conversations/') && url.includes('/responses') ||
      url.includes('/app-chat/conversations') ||
      // ChatGPT/OpenAI
      url.includes('conversations') && url.includes('openai') ||
      url.includes('/v1/chat') ||
      // 其他 AI 服务
      url.includes('anthropic') || url.includes('huggingface') || url.includes('together') ||
      url.includes('bedrock') || url.includes('azure')
    );
    
    const shouldIgnore = url && !isAIChatRequest && (
      // 过滤分析和追踪工具
      url.includes('mixpanel') ||
      url.includes('segment') ||
      url.includes('google-analytics') ||
      url.includes('analytics') ||
      url.includes('facebook.com') ||
      url.includes('sentry') ||
      url.includes('amplitude') ||
      url.includes('intercom') ||
      url.includes('datadog') ||
      url.includes('newrelic') ||
      url.includes('bugsnag') ||
      url.includes('rollbar') ||
      url.includes('raygun') ||
      url.includes('loggly') ||
      url.includes('splunk') ||
      url.includes('logs') && url.includes('elastic') ||
      // 过滤广告和营销
      url.includes('ads') ||
      url.includes('advert') ||
      url.includes('doubleclick') ||
      url.includes('tracking') ||
      url.includes('pixel') ||
      // 过滤 CDN 和 静态资源
      url.includes('cdn') ||
      url.includes('static') ||
      url.includes('.png') || url.includes('.jpg') || url.includes('.gif') || url.includes('.webp') ||
      url.includes('.css') || url.includes('.js') && !url.includes('grok') && !url.includes('claude') && !url.includes('openai') ||
      // 过滤其他无关服务
      url.includes('stripe.com') ||
      url.includes('slack') ||
      url.includes('github.com/') ||
      url.includes('gravatar') ||
      url.includes('cloudflare')
    );
    
    if (shouldIgnore && type !== 'warn') {
      return; // 静默忽略这些请求
    }
    
    window.postMessage({ __sse_viewer: true, type, url, time: Date.now(), payload }, '*');
  }
  
  // 调试日志（可通过 sessionStorage 控制）
  const enableDebug = sessionStorage.getItem('sse-viewer-debug') === 'true';
  function debug(msg, data) {
    if (enableDebug) console.log('[SSE Viewer]', msg, data);
  }

  // 1) 拦截原生 EventSource
  try {
    const OriginalEventSource = window.EventSource;
    if (OriginalEventSource) {
      const Wrapped = function (url, init) {
        const es = new OriginalEventSource(url, init);
        es.addEventListener('open', () => {
          post('open', url, { lastEventId: es.lastEventId, readyState: es.readyState });
        });
        es.addEventListener('message', (evt) => {
          let json = null;
          try { json = JSON.parse(evt.data); } catch {}
          post('message', url, {
            data: evt.data,
            event: evt.type || 'message',
            id: evt.lastEventId || es.lastEventId || undefined,
            json,
          });
        });
        es.addEventListener('error', () => {
          post('error', url, { readyState: es.readyState });
        });
        const close = es.close.bind(es);
        es.close = function () {
          post('close', url, {});
          return close();
        };
        return es;
      };
      Wrapped.prototype = OriginalEventSource.prototype;
      Wrapped.CONNECTING = OriginalEventSource.CONNECTING;
      Wrapped.OPEN = OriginalEventSource.OPEN;
      Wrapped.CLOSED = OriginalEventSource.CLOSED;
      Object.defineProperty(window, 'EventSource', { value: Wrapped });
    }
  } catch (e) {
    post('warn', 'EventSource', { message: String(e) });
  }

  // 2) 拦截 ReadableStream.getReader() - 这是 @microsoft/fetch-event-source 的关键
  try {
    const OriginalReadableStream = window.ReadableStream;
    if (OriginalReadableStream && OriginalReadableStream.prototype.getReader) {
      const origGetReader = OriginalReadableStream.prototype.getReader;
      
      OriginalReadableStream.prototype.getReader = function(options) {
        const reader = origGetReader.call(this, options);
        
        // 检查这个流是否来自 text/event-stream 响应
        // 我们需要在 fetch 时标记这个流
        if (this.__sse_viewer_url) {
          const url = this.__sse_viewer_url;
          // 为每个 ReadableStream 实例生成唯一的 streamId
          // 这样即使 URL 相同，也能区分不同的连接
          const streamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const originalRead = reader.read.bind(reader);
          const decoder = new TextDecoder('utf-8');
          let buf = '';
          
          debug('Intercepted getReader for SSE stream', { url, streamId });
          post('stream-open', url, { streamId });
          
          reader.read = async function() {
            const result = await originalRead();
            
            if (result.done) {
              debug('Stream done', { url, streamId });
              post('stream-close', url, { streamId });
              return result;
            }
            
            try {
              const chunk = decoder.decode(result.value, { stream: true });
              debug('Chunk received', { url, length: chunk.length, preview: chunk.substring(0, 100) });
              
              // 检测是否为纯 JSON 流或标准 SSE 格式
              // 1. 纯JSON流：每行一个JSON对象，无 data:/event:/id:/retry: 前缀
              // 2. 标准SSE：有 data:/event:/id:/retry: 等前缀
              const hasSSEFormat = chunk.includes('data:') || chunk.includes('event:');
              
              if (!hasSSEFormat) {
                // 纯JSON流或JSON数据
                const lines = chunk.split(/\r?\n/).filter(l => l.trim());
                for (const line of lines) {
                  let json = null;
                  try { json = JSON.parse(line); } catch {}
                  if (json) {
                    post('message', url, {
                      streamId,
                      data: line,
                      event: json.type || json.event || 'message',
                      json
                    });
                  } else if (line.trim()) {
                    // 不是JSON的行，也记录元数据
                    post('message', url, {
                      streamId,
                      data: line,
                      event: 'message',
                      json: null
                    });
                  }
                }
              } else {
                // 标准 SSE 格式
                buf += chunk;
                const frames = buf.split(/\r?\n\r?\n/);
                buf = frames.pop() || '';
                
                for (const frame of frames) {
                  if (!frame.trim()) continue;
                  
                  const lines = frame.split(/\r?\n/);
                  const msg = { data: '', event: 'message' };
                  
                  for (const line of lines) {
                    if (line.startsWith('data:')) {
                      const dataContent = line.slice(5);
                      msg.data += (dataContent.startsWith(' ') ? dataContent.slice(1) : dataContent) + '\n';
                    } else if (line.startsWith('event:')) {
                      msg.event = line.slice(6).trim() || 'message';
                    } else if (line.startsWith('id:')) {
                      msg.id = line.slice(3).trim();
                    } else if (line.startsWith('retry:')) {
                      const r = parseInt(line.slice(6).trim(), 10);
                      if (!Number.isNaN(r)) msg.retry = r;
                    }
                  }
                  
                  if (msg.data.endsWith('\n')) msg.data = msg.data.slice(0, -1);
                  let json = null;
                  try { json = JSON.parse(msg.data); } catch {}
                  post('message', url, { streamId, ...msg, json });
                }
              }
            } catch (e) {
              debug('Parse error', e);
            }
            
            return result;
          };
        }
        
        return reader;
      };
      
      debug('ReadableStream.getReader intercepted');
    }
  } catch (e) {
    post('warn', 'getReader-init', { message: String(e) });
  }

  // 3) 拦截 XMLHttpRequest (XHR) - 查看是否使用 XHR 个性化流
  try {
    const OriginalXHR = window.XMLHttpRequest;
    const XHRPrototype = OriginalXHR.prototype;
    const origOpen = XHRPrototype.open;
    const origSend = XHRPrototype.send;
    
    XHRPrototype.open = function(method, url, ...rest) {
      this.__sse_viewer_url = url;
      this.__sse_viewer_method = method;
      return origOpen.apply(this, [method, url, ...rest]);
    };
    
    XHRPrototype.send = function(...args) {
      const xhr = this;
      const url = xhr.__sse_viewer_url;
      const method = xhr.__sse_viewer_method;
      
      debug('XHR send', { url, method });
      
      let receivedChunks = '';
      let hasStartedReceiving = false;
      let streamOpened = false;
      
      // 方法 1: 通过 onreadystatechange 监听
      const origOnReadyStateChange = xhr.onreadystatechange;
      const handleReadyStateChange = function() {
        if (xhr.readyState === 2) {
          const ct = xhr.getResponseHeader('content-type') || '';
          if ((ct.includes('application/json') || ct.includes('text/event-stream')) && !streamOpened) {
            streamOpened = true;
            debug('XHR streaming detected', { url, contentType: ct });
            post('stream-open', url, { type: 'xhr-stream', method: method });
          }
        } else if (xhr.readyState === 3) {
          hasStartedReceiving = true;
          const responseText = xhr.responseText;
          const newData = responseText.substring(receivedChunks.length);
          
          if (newData) {
            debug('XHR chunk received', { url, length: newData.length });
            
            const lines = newData.split(/\r?\n/).filter(l => l.trim());
            for (const line of lines) {
              let json = null;
              try { json = JSON.parse(line); } catch {}
              if (json) {
                post('message', url, {
                  data: line,
                  event: json.type || json.event || 'message',
                  json
                });
              }
            }
          }
          receivedChunks = responseText;
        } else if (xhr.readyState === 4) {
          if (streamOpened) {
            debug('XHR stream closed', { url });
            post('stream-close', url, {});
          }
        }
        
        if (origOnReadyStateChange) {
          return origOnReadyStateChange.apply(this, arguments);
        }
      };
      
      xhr.onreadystatechange = handleReadyStateChange;
      
      // 方法 2: 通过 addEventListener 监听（某些框架用这个）
      const origAddEventListener = xhr.addEventListener;
      xhr.addEventListener = function(type, listener, ...args) {
        if (type === 'readystatechange') {
          return origAddEventListener.call(this, type, function() {
            handleReadyStateChange.call(xhr);
            listener.call(xhr);
          }, ...args);
        }
        return origAddEventListener.apply(this, arguments);
      };
      
      return origSend.apply(this, args);
    };
    
    debug('XMLHttpRequest intercepted');
  } catch (e) {
    post('warn', 'xhr-init', { message: String(e) });
  }

  // 4) 拦截 fetch 以标记 SSE 流
  try {
    const origFetch = window.fetch;
    if (typeof origFetch === 'function') {
      window.fetch = async function (...args) {
        const url = (typeof args[0] === 'string') ? args[0] : (args[0]?.url || '');
        debug('fetch called', { url });
        
        const res = await origFetch(...args);
        const ct = res.headers?.get?.('content-type') || '';
        const isStreamLike = ct.includes('text/event-stream') || ct.includes('application/json');
        
        if (isStreamLike && res.body) {
          debug('Stream detected (SSE or JSON)', { url, contentType: ct });
          
          // 标记 ReadableStream
          res.body.__sse_viewer_url = url;
          
          // 拦截 .text() 方法
          const origText = res.text.bind(res);
          res.text = async function() {
            debug('Fetch response.text() called', { url });
            post('stream-open', url, { type: 'fetch-text' });
            
            try {
              const text = await origText();
              debug('Fetch response.text() completed', { url, length: text.length });
              
              // 尝试解析为行分割的 JSON
              const lines = text.split(/\r?\n/).filter(l => l.trim());
              for (const line of lines) {
                let json = null;
                try { json = JSON.parse(line); } catch {}
                if (json) {
                  post('message', url, {
                    data: line,
                    event: json.type || json.event || 'message',
                    json
                  });
                }
              }
              
              post('stream-close', url, { type: 'fetch-text' });
              return text;
            } catch (e) {
              debug('Fetch response.text() error', { url, error: String(e) });
              throw e;
            }
          };
          
          // 拦截 .json() 方法
          const origJson = res.json.bind(res);
          res.json = async function() {
            debug('Fetch response.json() called', { url });
            post('stream-open', url, { type: 'fetch-json' });
            
            try {
              const json = await origJson();
              debug('Fetch response.json() completed', { url });
              post('message', url, {
                data: JSON.stringify(json),
                event: 'message',
                json
              });
              post('stream-close', url, { type: 'fetch-json' });
              return json;
            } catch (e) {
              debug('Fetch response.json() error', { url, error: String(e) });
              throw e;
            }
          };
        }
        
        return res;
      };
      debug('fetch intercepted');
    }
  } catch (e) {
    post('warn', 'fetch-init', { message: String(e) });
  }
  
  debug('SSE Viewer injection complete');
  post('init', 'SSE Viewer', { message: 'Interceptors installed successfully' });
  
  // 5) 作为最后的汞殿：收集所有 console.log/warn 流
  // 有些框架可能在接收到数据时会打印，我们可以捕获
  try {
    const origLog = window.console.log;
    const origWarn = window.console.warn;
    const origError = window.console.error;
    
    // 检查是否是流数据日志
    function checkIfStreamData(args) {
      for (const arg of args) {
        if (typeof arg === 'string' || typeof arg === 'object') {
          const str = String(arg);
          // 检查是否看起像是 JSON 或 SSE 数据
          if (str.includes('data:') || str.includes('event:') || 
              (str.startsWith('{') && str.endsWith('}')) ||
              str.includes('\"type\"') || str.includes('\"token\"')) {
            return true;
          }
        }
      }
      return false;
    }
    
    window.console.log = function(...args) {
      if (checkIfStreamData(args)) {
        debug('Console.log stream data detected', args[0]);
        post('message', 'console.log', {
          data: String(args[0]),
          event: 'console-log',
          json: typeof args[0] === 'object' ? args[0] : null
        });
      }
      return origLog.apply(console, args);
    };
    
    window.console.warn = function(...args) {
      if (checkIfStreamData(args)) {
        debug('Console.warn stream data detected', args[0]);
        post('message', 'console.warn', {
          data: String(args[0]),
          event: 'console-warn',
          json: typeof args[0] === 'object' ? args[0] : null
        });
      }
      return origWarn.apply(console, args);
    };
    
    debug('Console logging intercepted');
  } catch (e) {
    post('warn', 'console-init', { message: String(e) });
  }
})();
