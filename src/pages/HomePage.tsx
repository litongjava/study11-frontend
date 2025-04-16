// HomePage.tsx
import {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import './HomePage.css';

// 定义接口类型，可根据返回数据结构扩展
type VideoItem = {
  id: string;
  cover_url: string;
  title: string;
  video_url: string;
};

export default function HomePage() {
  const navigate = useNavigate();
  const [topic, setTopic] = useState('');
  const [generatedVideo, setGeneratedVideo] = useState<VideoItem | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 分页参数
  const [page, setPage] = useState(1);
  const limit = 12;
  const [total, setTotal] = useState(0);
  const [videos, setVideos] = useState<VideoItem[]>([]);

  // 从 .env 中读取服务器地址（确保在项目根目录下创建 .env 文件并定义 VITE_SERVER_BACKEND）
  const serverAddress = import.meta.env.VITE_SERVER_BACKEND;

  // 加载推荐视频列表，修改接口URL参数使用 pageNo 与 pageSize
  useEffect(() => {
    fetch(`${serverAddress}/v1/api/html/recommends?pageNo=${page}&pageSize=${limit}&sort_by=recent`)
      .then(response => response.json())
      .then(data => {
        if (data.code === 1 && data.ok) {
          // 根据返回的数据字段做映射：推荐接口返回字段有 id, topic, url
          const mappedVideos: VideoItem[] = data.data.videos.map((item: any) => ({
            id: item.id,
            cover_url: item.url, // 使用 url 作为封面预览
            title: item.topic,
            video_url: item.url, // 使用同一 URL 作为视频播放地址
          }));
          setVideos(mappedVideos);
          setTotal(data.data.total);
        } else {
          console.error('获取推荐视频返回错误：', data);
        }
      })
      .catch(err => {
        console.error('获取推荐视频失败:', err);
      });
  }, [page, serverAddress]);

  // 调用生成接口，修改生成接口地址
  const generateVideo = () => {
    if (!topic.trim()) {
      setError('请输入主题');
      return;
    }
    setError('');
    setLoading(true);

    const url = `${serverAddress}/v1/api/html/generate?topic=${encodeURIComponent(topic)}`;
    fetch(url)
      .then(res => res.json())
      .then(data => {
        setLoading(false);
        if (data.code === 1 && data.ok && data.data) {
          // 新接口只返回 data.url，即预览 URL
          const newVideo: VideoItem = {
            id: new Date().getTime().toString(),
            cover_url: data.data.url,
            title: topic,
            video_url: data.data.url,
          };
          setGeneratedVideo(newVideo);
        } else {
          setError('视频生成失败');
        }
      })
      .catch(err => {
        console.error('生成动画出错:', err);
        setLoading(false);
        setError('视频生成失败');
      });
  };

  // 点击视频后跳转到播放器页面
  const handlePlayVideo = (video: VideoItem) => {
    navigate(`/player/${video.id}`, {
      state: { videoUrl: video.video_url, coverUrl: video.cover_url, title: video.title },
    });
  };

  // 分页控制
  const totalPages = Math.ceil(total / limit);
  const handlePreviousPage = () => {
    if (page > 1) setPage(page - 1);
  };
  const handleNextPage = () => {
    if (page < totalPages) setPage(page + 1);
  };

  return (
    <div className="home-page">
      <h1>Show Me Anything</h1>
      {/* 生成动画区域 */}
      <div className="generate-section">
        <input
          type="text"
          placeholder="描述想要讲解的技术概念"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
        <button onClick={generateVideo} disabled={loading}>
          {loading ? '生成中...' : '生成动画'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {/* 生成成功后的视频卡片 */}
      {generatedVideo && (
        <div className="generated-card">
          <h3>{generatedVideo.title}</h3>
          {/* 如果可行，使用 iframe 显示预览 */}
          <iframe
            src={generatedVideo.video_url}
            width="160"
            height="90"
            frameBorder="0"
            title={generatedVideo.title}
          ></iframe>
          <button onClick={() => handlePlayVideo(generatedVideo)}>去播放</button>
        </div>
      )}

      {/* 推荐动画展示 */}
      <h2>推荐动画</h2>
      <div className="videos-grid">
        {videos.map((video) => (
          <div key={video.id} className="video-item" onClick={() => handlePlayVideo(video)}>
            {/* 替换原来的 img 标签为 iframe 预览 */}
            <iframe
              src={video.video_url}
              width="160"
              height="90"
              frameBorder="0"
              title={video.title}
            ></iframe>
            <p>{video.title}</p>
          </div>
        ))}
      </div>

      {/* 分页控制 */}
      <div className="pagination">
        <button onClick={handlePreviousPage} disabled={page === 1}>
          上一页
        </button>
        <span>
          第 {page} 页，共 {totalPages} 页
        </span>
        <button onClick={handleNextPage} disabled={page === totalPages}>
          下一页
        </button>
      </div>
    </div>
  );
}
