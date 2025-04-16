// PlayerPage.tsx
import React, {useEffect, useState} from 'react';
import {useLocation, useNavigate, useParams} from 'react-router-dom';
import './PlayerPage.css';

interface VideoInfo {
  videoUrl: string;
  coverUrl: string;
  title: string;
}

export default function PlayerPage() {
  const {id} = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  // 优先从路由 state 中拿到视频信息
  const locationState = location.state as VideoInfo | undefined;
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(locationState || null);
  const [loading, setLoading] = useState(!locationState);

  // 从 .env 中读取服务器地址（用于 detail 接口，如有需要）
  const serverAddress = import.meta.env.VITE_SERVER_BACKEND;

  // 若 videoInfo 不存在，则通过 id 从后端获取视频详情（示例中假设返回格式与生成/推荐类似）
  useEffect(() => {
    if (!videoInfo && id) {
      fetch(`${serverAddress}/v1/api/html/detail?id=${id}`)
        .then(res => res.json())
        .then((data) => {
          if (data.code === 1 && data.ok && data.data) {
            setVideoInfo({
              videoUrl: data.data.url,
              coverUrl: data.data.url, // 根据返回数据确定字段映射
              title: data.data.topic || 'Video',
            });
          } else {
            console.error('无法获取视频信息:', data);
          }
          setLoading(false);
        })
        .catch((err) => {
          console.error('获取视频信息出错:', err);
          setLoading(false);
        });
    }
  }, [id, videoInfo, serverAddress]);

  if (loading) {
    return (
      <div className="player-page">
        <p>加载视频信息中...</p>
      </div>
    );
  }

  if (!videoInfo) {
    return (
      <div className="player-page">
        <h2>未找到视频信息</h2>
        <button onClick={() => navigate('/')}>返回首页</button>
      </div>
    );
  }

  return (
    <div className="player-page">
      <header className="player-header">
        <button onClick={() => navigate(-1)} className="back-button">
          ← 返回
        </button>
        <h1>{videoInfo.title}</h1>
      </header>
      <div className="video-container">
        {/* 播放页面使用 iframe 加载预览 URL */}
        <iframe
          src={videoInfo.videoUrl}
          title={videoInfo.title}
          frameBorder="0"
          width="100%"
          height="650px"
        ></iframe>
      </div>

      <div className="video-info">
        <h3>动画信息</h3>
        <p>
          <strong>动画地址: </strong>
          <a href={videoInfo.videoUrl} target="_blank" rel="noopener noreferrer">
            {videoInfo.videoUrl}
          </a>
        </p>
      </div>
    </div>
  );
}
