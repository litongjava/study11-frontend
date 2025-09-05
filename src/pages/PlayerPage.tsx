// src/pages/PlayerPage.tsx
import {useEffect, useRef, useState} from 'react';
import {useLocation, useNavigate, useParams} from 'react-router-dom';
import './PlayerPage.css';
import {sendVideoSSERequest, type SSEEvent} from '../client/SSEClient.ts';
// 添加数学公式和表格支持

// 默认封面URL
const DEFAULT_COVER_URL = 'https://via.placeholder.com/800x450?text=Video+Cover';

type PlayerMode = 'video' | 'iframe';

interface VideoInfo {
  videoUrl: string;      // 可能是视频直链或一个HTML页面链接
  coverUrl: string;
  title: string;
  answer: string;
  transcript: string[];
  playerMode: PlayerMode; // 新增：播放模式
}

interface SSERouteParams {
  question: string;
  provider: string;
  voice_provider: string;
  voice_id: string;
  language: string;
  user_id: string;
}

export default function PlayerPage() {
  const {id: routeId} = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isDev = localStorage.getItem('app.env') === 'dev';

  const sseParams = (location.state as SSERouteParams) || null;
  const containerRef = useRef<HTMLDivElement>(null);
  const dpRef = useRef<any>(null);

  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [videoId, setVideoId] = useState<string | null>(routeId || null);
  const [countdown, setCountdown] = useState(240); // 4分钟
  const [pastThreeMinutes, setPastThreeMinutes] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [progressList, setProgressList] = useState<string[]>([]);
  const [isSSEDone, setIsSSEDone] = useState<boolean>(true);
  const [lastHeartbeatTime, setLastHeartbeatTime] = useState<number | null>(null);
  const [heartbeatElapsed, setHeartbeatElapsed] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'info' | 'answer' | 'transcript'>('info');
  const [selectedProvider, setSelectedProvider] = useState(sseParams?.provider || 'openai');
  const [copiedItems, setCopiedItems] = useState<Record<string, boolean>>({});
  const [sseError, setSseError] = useState<string | null>(null);

  const sseReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const hasSubscribed = useRef(false);
  const pageBoxRef = useRef<HTMLDivElement>(null);

  // 确保封面URL有效
  const getSafeCoverUrl = (url: string | null | undefined): string => {
    return url && url.trim() !== '' ? url : DEFAULT_COVER_URL;
  };

  const openInNewTab = () => {
    if (!videoInfo?.videoUrl) return;
    window.open(videoInfo.videoUrl, '_blank', 'noopener');
  };


  // 判断是否是常见的视频直链
  const isVideoUrl = (url: string) => {
    try {
      const u = new URL(url, window.location.origin);
      const pathname = u.pathname.toLowerCase();
      return (
        pathname.endsWith('.mp4') ||
        pathname.endsWith('.webm') ||
        pathname.endsWith('.ogg') ||
        pathname.endsWith('.m3u8')
      );
    } catch {
      // 不是合法URL时，尽量按视频直链的老逻辑走（保守处理为视频）
      return true;
    }
  };

  // 根据URL检测播放器模式：直链视频 -> 'video'；否则 -> 'iframe'
  const detectPlayerMode = (url: string): PlayerMode => {
    return isVideoUrl(url) ? 'video' : 'iframe';
  };

  // 复制文本到剪贴板
  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedItems(prev => ({...prev, [key]: true}));
      setTimeout(() => setCopiedItems(prev => ({...prev, [key]: false})), 2000);
    });
  };

  const shareLink = () => {
    if (!videoInfo?.videoUrl) return;
    copyToClipboard(videoInfo.videoUrl, 'share');
  };


  // 倒计时和总耗时计时器
  useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
      setCountdown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (countdown === 0) setPastThreeMinutes(true);
  }, [countdown]);

  // 心跳计时器
  useEffect(() => {
    if (lastHeartbeatTime === null) return;

    const hbTimer = window.setInterval(() => {
      setHeartbeatElapsed(Math.floor((Date.now() - lastHeartbeatTime) / 1000));
    }, 1000);

    return () => clearInterval(hbTimer);
  }, [lastHeartbeatTime]);

  // 获取视频详情
  useEffect(() => {
    if (videoId && isSSEDone) {
      fetchVideoDetail(videoId);
    }
  }, [videoId, isSSEDone]);

  useEffect(() => {
    if (videoInfo?.playerMode !== 'iframe') return;

    function fit() {
      const box = pageBoxRef.current;
      if (!box) return;
      // 容器到视口顶的距离（不含滚动条）
      const top = box.getBoundingClientRect().top;
      // 你想预留的底部安全边距（给 tabs/页脚留一点空间）
      const bottomSafe = 12; // 可按需调整
      const h = Math.max(200, window.innerHeight - top - bottomSafe);
      box.style.height = `${h}px`;
    }

    fit();
    // // 监听窗口变化
    // window.addEventListener('resize', fit);
    // window.addEventListener('scroll', fit, {passive: true});
    //
    // // 如果外层有布局抖动，给一点异步补偿
    // const t1 = setTimeout(fit, 50);
    // const t2 = setTimeout(fit, 300);

    // return () => {
    //   window.removeEventListener('resize', fit);
    //   window.removeEventListener('scroll', fit);
    //   clearTimeout(t1);
    //   clearTimeout(t2);
    // };
  }, [videoInfo?.playerMode]);


  async function fetchVideoDetail(id: string) {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_BACKEND_BASE_URL}/api/v1/video/detail?id=${id}`
      );
      const result = await res.json();

      if (res.ok && result.code === 1 && result.ok && result.data) {
        const data = result.data as any;
        if (data.video_url) {
          const url = data.video_url as string;
          setVideoInfo({
            videoUrl: url,
            coverUrl: getSafeCoverUrl(data.cover_url),
            title: data.title || 'Video',
            answer: data.answer || '',
            transcript: Array.isArray(data.transcript) ? data.transcript : [],
            playerMode: detectPlayerMode(url),
          });
        }
      }
    } catch (err) {
      console.error('获取视频详情出错:', err);
    }
  }

  // 发起SSE请求
  useEffect(() => {
    if (!videoId && sseParams && !hasSubscribed.current) {
      hasSubscribed.current = true;
      setIsSSEDone(false);

      const params = {...sseParams};
      if (isDev) params.provider = selectedProvider;

      sendVideoSSERequest({
        ...params,
        onEvent: (event: SSEEvent) => {
          // 心跳事件
          if (event.type === 'error') {
            try {
              const errorData = JSON.parse(event.data);
              setSseError(errorData.error || "视频生成失败");
            } catch (e) {
              setSseError("视频生成过程中发生错误");
            }
            setIsSSEDone(true);
            return;
          } else if (event.type === '401') {
            const errorData = JSON.parse(event.data);
            setSseError(errorData.msg || "积分不足，请充值后再试");
          } else if (event.type === 'heartbeat') {
            setLastHeartbeatTime(Date.now());
            setHeartbeatElapsed(0);
            return;
          }
          // 进度更新
          else if (event.type === 'progress') {
            try {
              const payload = JSON.parse(event.data) as { info: string };
              setProgressList(prev => [...prev, payload.info]);
            } catch {
              setProgressList(prev => [...prev, event.data]);
            }
            return;
          }

          // 收到ID
          else if (event.type === 'task' || event.type === 'metadata') {
            try {
              const payload = JSON.parse(event.data) as { id: string };
              setVideoId(payload.id);
              window.history.replaceState({}, '', `#/player/${payload.id}`);
            } catch (e) {
              console.error('解析ID失败:', e);
            }
            return;
          }

          // 收到播放URL（可能是视频直链，也可能是HTML页面）
          else if (event.type === 'main') {
            try {
              const payload = JSON.parse(event.data) as { url: string };
              const mode = detectPlayerMode(payload.url);
              setVideoInfo(prev => ({
                videoUrl: payload.url,
                coverUrl: getSafeCoverUrl(prev?.coverUrl),
                title: prev?.title || sseParams.question,
                answer: '',
                transcript: [],
                playerMode: mode,
              }));
            } catch (e) {
              console.error('解析播放URL失败:', e);
            }
            return;
          }

          // SSE完成
          else if (event.type === 'done') {
            sseReaderRef.current = null;
            setIsSSEDone(true);
          }
        },
      }).catch(e => {
        console.error('SSE请求出错:', e);
        setIsSSEDone(true);
      });
    }
  }, [videoId, sseParams, selectedProvider]);

  // 轮询获取视频信息
  useEffect(() => {
    const shouldPoll = Boolean(videoId && !videoInfo && (isSSEDone || !sseParams));
    if (!shouldPoll) return;

    const pollInterval = 5000;
    const timerRef = {current: 0 as number};

    async function tryFetch() {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_BACKEND_BASE_URL}/api/v1/video/detail?id=${videoId}`
        );
        const result = await res.json();

        if (res.ok && result.code === 1 && result.ok && result.data) {
          const data = result.data as any;
          if (data.video_url) {
            clearInterval(timerRef.current);
            const url = data.video_url as string;
            setVideoInfo({
              videoUrl: url,
              coverUrl: getSafeCoverUrl(data.cover_url),
              title: data.title || 'Video',
              answer: data.answer || '',
              transcript: Array.isArray(data.transcript) ? data.transcript : [],
              playerMode: detectPlayerMode(url),
            });
          }
        }
      } catch (err) {
        console.error('轮询获取视频失败:', err);
      }
    }

    timerRef.current = window.setInterval(() => {
      if (elapsedSeconds >= 1800) {
        clearInterval(timerRef.current);
        window.alert('视频生成超时，请联系 litonglinux@qq.com 获取帮助。');
        return;
      }
      if (videoInfo) {
        clearInterval(timerRef.current);
        return;
      }
      tryFetch();
    }, pollInterval);

    return () => clearInterval(timerRef.current);
  }, [videoId, videoInfo, elapsedSeconds, isSSEDone, sseParams]);

  // 初始化播放器（仅视频模式）
  useEffect(() => {
    if (!videoInfo) return;

    if (videoInfo.playerMode === 'iframe') {
      // iframe 模式无需初始化视频播放器
      return;
    }

    if (!containerRef.current) return;

    let videoType: string = 'normal';
    if (videoInfo.videoUrl.endsWith('.m3u8')) {
      videoType = 'hls';
      // @ts-ignore
      window.Hls = Hls;
    }

    // 你的播放器初始化逻辑（此处保留占位；实际项目中替换为DPlayer等初始化）
    // 例如：
    // dpRef.current = new DPlayer({ ... , video: { url: videoInfo.videoUrl, type: videoType } });

    if (videoType === 'hls' && dpRef.current?.video) {
      dpRef.current.video.addEventListener('loadedmetadata', () => {
        dpRef.current.video.currentTime = 0.1;
        dpRef.current.play();
      });
    }

    return () => {
      if (dpRef.current) {
        if (dpRef.current.$hls) dpRef.current.$hls.destroy();
        dpRef.current.destroy();
        dpRef.current = null;
      }
    };
  }, [videoInfo]);

  // 渲染不同状态下的UI
  const renderContent = () => {
    if (sseError) {
      return (
        <div className="player-page error-view">
          <div className="error-card">
            <h2>发生错误</h2>
            <p>{sseError}</p>
            {sseError.includes("积分不足") && (
              <button
                onClick={() => navigate('/recharge')}
                className="primary-button"
                style={{marginTop: '15px'}}
              >
                立即充值
              </button>
            )}
            <button
              onClick={() => navigate('/')}
              className="primary-button"
              style={{marginTop: '10px'}}
            >
              返回首页
            </button>
          </div>
        </div>
      );
    }
    // 1) 缺少必要参数
    if (!videoId && !sseParams) {
      return (
        <div className="player-page error-view">
          <div className="error-card">
            <h2>未找到视频信息</h2>
            <p>请检查URL或返回首页重新开始</p>
            <button onClick={() => navigate('/')} className="primary-button">
              返回首页
            </button>
          </div>
        </div>
      );
    }

    // 2) 视频生成中（前三分钟）
    if ((!videoInfo && !routeId && sseParams) || (!videoInfo && countdown > 0 && videoId)) {
      return (
        <div className="player-page generating-view">
          <div className="header">
            <button onClick={() => navigate(-1)} className="back-button">
              ← 返回
            </button>
            <h1>视频生成中</h1>
          </div>

          <div className="progress-container">
            <div className="countdown-badge">
              {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}
            </div>

            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{width: `${((180 - countdown) / 180) * 100}%`}}
              ></div>
            </div>

            <div className="status-message">
              {countdown > 120 ? '准备生成资源...' :
                countdown > 60 ? '处理视频内容...' :
                  '合成最终视频...'}
            </div>
          </div>

          {isDev && (
            <div className="provider-selector">
              <label>LLM Provider:</label>
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
                disabled={!isSSEDone}
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="cohere">Cohere</option>
                <option value="replicate">Replicate</option>
              </select>
            </div>
          )}

          {!isSSEDone && (
            <div className="heartbeat-info">
              <span className="heartbeat-icon">❤️</span>
              心跳: {heartbeatElapsed}秒前
            </div>
          )}

          {progressList.length > 0 && (
            <div className="progress-log">
              <h3>生成日志</h3>
              <div className="log-container">
                {progressList.map((info, idx) => (
                  <div key={idx} className="log-entry">
                    <span className="log-time">
                      {new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                    </span>
                    {info}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    // 3) 超过三分钟继续后台轮询
    if (!videoInfo && pastThreeMinutes && elapsedSeconds < 1800) {
      return (
        <div className="player-page generating-view">
          <div className="header">
            <button onClick={() => navigate(-1)} className="back-button">
              ← 返回
            </button>
            <h1>后台处理中</h1>
          </div>

          <div className="waiting-message">
            <div className="spinner"></div>
            <p>视频仍在生成中，请耐心等待...</p>
            <p className="elapsed-time">
              已等待: {Math.floor(elapsedSeconds / 60)}分{elapsedSeconds % 60}秒
            </p>
          </div>

          {!isSSEDone && (
            <div className="heartbeat-info">
              <span className="heartbeat-icon">❤️</span>
              心跳: {heartbeatElapsed}秒前
            </div>
          )}

          {progressList.length > 0 && (
            <div className="progress-log">
              <h3>生成日志</h3>
              <div className="log-container">
                {progressList.map((info, idx) => (
                  <div key={idx} className="log-entry">{info}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    // 4) 超过30分钟仍未拿到 videoInfo
    if (!videoInfo && elapsedSeconds >= 1800) {
      return (
        <div className="player-page error-view">
          <div className="error-card">
            <h2>生成超时</h2>
            <p>视频生成时间超过30分钟，请联系客服获取帮助</p>
            <div className="contact-info">
              <p>邮箱: litonglinux@qq.com</p>
            </div>
            <button onClick={() => navigate('/')} className="primary-button">
              返回首页
            </button>
          </div>

          {progressList.length > 0 && (
            <div className="progress-log">
              <h3>生成日志</h3>
              <div className="log-container">
                {progressList.map((info, idx) => (
                  <div key={idx} className="log-entry">{info}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    // 5) 成功获取视频信息
    if (videoInfo) {
      return (
        <div className="player-page success-view">
          <div className="header">
            <button onClick={() => navigate(-1)} className="back-button">
              ← 返回
            </button>

            <div className="title-row">
              <h1>{videoInfo.title}</h1>

              <div className="title-actions">
                {videoInfo?.videoUrl && (
                  <>
                    <button
                      className="open-new-btn"
                      onClick={openInNewTab}
                      title="在新标签打开"
                    >
                      在新标签打开
                    </button>

                    <button
                      className="share-btn"
                      onClick={shareLink}
                      title="Share"
                    >
                      {copiedItems['share'] ? '✓ 已复制' : '分享'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div
            className={`video-container ${videoInfo.playerMode === 'iframe' ? 'page' : 'video'}`}
            ref={videoInfo.playerMode === 'iframe' ? pageBoxRef : undefined}
          >
            {videoInfo.playerMode === 'iframe' ? (
              <iframe
                src={videoInfo.videoUrl}
                title={videoInfo.title}
                style={{width: '100%', height: '100%', border: 0}}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                referrerPolicy="no-referrer-when-downgrade"
              />
            ) : (
              <div ref={containerRef}></div>
            )}
          </div>
          <div className="tabs">
            <button
              className={`tab ${activeTab === 'info' ? 'active' : ''}`}
              onClick={() => setActiveTab('info')}
            >
              <i className="tab-icon">📋</i> 信息
            </button>
            <button
              className={`tab ${activeTab === 'answer' ? 'active' : ''}`}
              onClick={() => setActiveTab('answer')}
            >
              <i className="tab-icon">💬</i> 答案
            </button>
            <button
              className={`tab ${activeTab === 'transcript' ? 'active' : ''}`}
              onClick={() => setActiveTab('transcript')}
            >
              <i className="tab-icon">📝</i> 字幕
            </button>
          </div>

          <div className="tab-content">
            {activeTab === 'info' && (
              <div className="tab-panel info-panel">
                <div className="info-card">
                  <h3>视频信息</h3>
                  <div className="info-grid">
                    <div className="info-item">
                      <div className="info-header">
                        <label>{videoInfo.playerMode === 'iframe' ? '页面地址' : '视频地址'}</label>
                        <button
                          className="copy-button"
                          onClick={() => copyToClipboard(videoInfo.videoUrl, 'videoUrl')}
                        >
                          {copiedItems['videoUrl'] ? '✓ 已复制' : '复制'}
                        </button>
                      </div>
                      <a
                        href={videoInfo.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="info-link"
                        style={{wordBreak: 'break-all'}}
                      >
                        {videoInfo.videoUrl}
                      </a>
                    </div>
                    <div className="info-item">
                      <div className="info-header">
                        <label>封面地址</label>
                        <button
                          className="copy-button"
                          onClick={() => copyToClipboard(videoInfo.coverUrl, 'coverUrl')}
                        >
                          {copiedItems['coverUrl'] ? '✓ 已复制' : '复制'}
                        </button>
                      </div>
                      <a
                        href={videoInfo.coverUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="info-link"
                        style={{wordBreak: 'break-all'}}
                      >
                        {videoInfo.coverUrl === DEFAULT_COVER_URL
                          ? "默认封面"
                          : videoInfo.coverUrl}
                      </a>
                    </div>
                    {isDev && sseParams && (
                      <div className="info-item">
                        <label>LLM Provider</label>
                        <div className="provider-value">{sseParams.provider}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'transcript' && (
              <div className="tab-panel transcript-panel">
                <div className="transcript-card">
                  <div className="transcript-header">
                    <h3>视频字幕</h3>
                    <button
                      className="copy-button"
                      onClick={() => copyToClipboard(videoInfo.transcript.join('\n'), 'transcript')}
                    >
                      {copiedItems['transcript'] ? '✓ 已复制' : '复制'}
                    </button>
                  </div>
                  <ul className="transcript-list">
                    {videoInfo.transcript.map((line, idx) => (
                      <li key={idx} className="transcript-item">
                        <span className="line-number">{idx + 1}.</span>
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>

          {!isSSEDone && (
            <div className="footer-info">
              <div className="heartbeat-info">
                <span className="heartbeat-icon">❤️</span>
                心跳: {heartbeatElapsed}秒前
              </div>
              {progressList.length > 0 && (
                <div className="progress-log">
                  <div className="log-container">
                    {progressList.slice(-3).map((info, idx) => (
                      <div key={idx} className="log-entry">{info}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  return <>{renderContent()}</>;
}
