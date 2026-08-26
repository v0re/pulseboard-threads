export type MetricValue = number | null;

export type PostMetrics = {
  views: MetricValue;
  likes: MetricValue;
  replies: MetricValue;
  reposts: MetricValue;
  quotes: MetricValue;
  shares: MetricValue;
};

export type AccountMetrics = {
  views: MetricValue;
  likes: MetricValue;
  replies: MetricValue;
  reposts: MetricValue;
  quotes: MetricValue;
  clicks: MetricValue;
  followersCount: MetricValue;
};

export type ThreadsProfile = {
  id: string;
  username: string;
  name?: string;
  threads_profile_picture_url?: string;
  threads_biography?: string;
};

export type ThreadsPost = {
  id: string;
  media_product_type?: string;
  media_type?: string;
  permalink?: string;
  username?: string;
  text?: string;
  timestamp?: string;
  shortcode?: string;
  is_quote_post?: boolean;
  has_replies?: boolean;
};

export type ThreadsReply = {
  id: string;
  text?: string;
  username?: string;
  permalink?: string;
  timestamp?: string;
  media_type?: string;
  is_reply?: boolean;
  is_reply_owned_by_me?: boolean;
  root_post?: { id?: string };
  replied_to?: { id?: string };
  hide_status?: string;
};

export type PostViewModel = {
  id: string;
  text: string;
  mediaType: string;
  permalink: string;
  publishedAt: string;
  metrics: PostMetrics;
  engagementRate: number | null;
};
