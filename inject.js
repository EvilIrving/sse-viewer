// inject.js（主世界脚本，拦截 EventSource 和 fetch(text/event-stream)）
(function () {
  // 防止重复注入
  if (window.__sse_viewer_inject_installed) {
    console.warn('[SSE Viewer] Inject already installed, skipping');
    return;
  }
  window.__sse_viewer_inject_installed = true;

  function post(type, url, payload) {
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
          const originalRead = reader.read.bind(reader);
          const decoder = new TextDecoder('utf-8');
          let buf = '';
          
          debug('Intercepted getReader for SSE stream', url);
          post('stream-open', url, {});
          
          reader.read = async function() {
            const result = await originalRead();
            
            if (result.done) {
              debug('Stream done', url);
              post('stream-close', url, {});
              return result;
            }
            
            try {
              const chunk = decoder.decode(result.value, { stream: true });
              debug('Chunk received', { url, length: chunk.length, preview: chunk.substring(0, 100) });
              
              // 检测是否为纯 JSON 流（每行一个 JSON 对象）
              if (!chunk.includes('data:') && !chunk.includes('event:')) {
                const lines = chunk.split(/\r?\n/).filter(l => l.trim());
                for (const line of lines) {
                  let json = null;
                  try { json = JSON.parse(line); } catch {}
                  if (json) {
                    post('message', url, {
                      data: line,
                      event: json.type || 'message',
                      json
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
                  post('message', url, { ...msg, json });
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

  // 3) 拦截 fetch 以标记 SSE 流
  try {
    const origFetch = window.fetch;
    if (typeof origFetch === 'function') {
      window.fetch = async function (...args) {
        const url = (typeof args[0] === 'string') ? args[0] : (args[0]?.url || '');
        debug('fetch called', { url });
        
        const res = await origFetch(...args);
        const ct = res.headers?.get?.('content-type') || '';
        
        // 检测 SSE 流并标记
        if (ct.includes('text/event-stream') && res.body) {
          debug('SSE stream detected, marking body', url);
          // 在 ReadableStream 对象上标记 URL，供 getReader 拦截使用
          res.body.__sse_viewer_url = url;
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
})();
