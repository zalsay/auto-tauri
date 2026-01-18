package middleware

import (
	"context"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"golang.org/x/time/rate"
)

type RateLimitConfig struct {
	RequestsPerSecond float64
	Burst             int
}

type RateLimiter struct {
	redisClient  *redis.Client
	limiters     map[string]*rate.Limiter
	mu           sync.RWMutex
	defaultLimit rate.Limit
}

var (
	redisClient *redis.Client
	rateLimiter *RateLimiter
)

func InitRedisRateLimiter(addr string, password string, db int) error {
	client := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: password,
		DB:       db,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		return err
	}

	redisClient = client
	rateLimiter = NewRateLimiter(client)
	return nil
}

func NewRateLimiter(client *redis.Client) *RateLimiter {
	return &RateLimiter{
		redisClient:  client,
		limiters:     make(map[string]*rate.Limiter),
		defaultLimit: rate.Inf,
	}
}

func (rl *RateLimiter) getLimiter(key string, rps float64, burst int) *rate.Limiter {
	rl.mu.RLock()
	limiter, exists := rl.limiters[key]
	rl.mu.RUnlock()

	if exists {
		return limiter
	}

	limiter = rate.NewLimiter(rate.Limit(rps), burst)

	rl.mu.Lock()
	defer rl.mu.Unlock()

	if l, exists := rl.limiters[key]; exists {
		return l
	}

	rl.limiters[key] = limiter
	return limiter
}

type RateLimitMiddleware struct {
	limiter *RateLimiter
	config  RateLimitConfig
}

func NewRateLimitMiddleware(limiter *RateLimiter, config RateLimitConfig) *RateLimitMiddleware {
	if config.RequestsPerSecond == 0 {
		config.RequestsPerSecond = 10
	}
	if config.Burst == 0 {
		config.Burst = 20
	}
	return &RateLimitMiddleware{
		limiter: limiter,
		config:  config,
	}
}

func (rlm *RateLimitMiddleware) Limit() gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := GetUserID(c)
		if userID == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "unauthorized",
			})
			return
		}

		limiter := rlm.limiter.getLimiter(userID, rlm.config.RequestsPerSecond, rlm.config.Burst)

		if !limiter.Allow() {
			c.Header("X-RateLimit-Limit", strconv.Itoa(rlm.config.Burst))
			c.Header("X-RateLimit-Remaining", "0")
			c.Header("X-RateLimit-Reset", strconv.FormatInt(time.Now().Add(time.Second).Unix(), 10))
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error":       "rate_limit_exceeded",
				"message":     "Too many requests. Please try again later.",
				"retry_after": 1,
			})
			return
		}

		c.Header("X-RateLimit-Limit", strconv.Itoa(rlm.config.Burst))
		c.Header("X-RateLimit-Remaining", strconv.Itoa(rlm.config.Burst-1))
		c.Next()
	}
}

type RedisRateLimitMiddleware struct {
	client *redis.Client
	limit  int
	window time.Duration
	script *redis.Script
}

const redisRateLimitScript = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local current = redis.call('INCR', key)
if current == 1 then
    redis.call('EXPIRE', key, window)
end
local ttl = redis.call('TTL', key)
if current > limit then
    return {current, ttl, 0}
end
return {current, ttl, 1}
`

func NewRedisRateLimitMiddleware(client *redis.Client, limit int, window time.Duration) *RedisRateLimitMiddleware {
	return &RedisRateLimitMiddleware{
		client: client,
		limit:  limit,
		window: window,
		script: redis.NewScript(redisRateLimitScript),
	}
}

func (rlm *RedisRateLimitMiddleware) Limit() gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := GetUserID(c)
		if userID == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "unauthorized",
			})
			return
		}

		key := "ratelimit:" + userID + ":" + c.FullPath()

		ctx := context.Background()
		result, err := rlm.script.Run(ctx, rlm.client, []string{key}, rlm.limit, int(rlm.window.Seconds())).Slice()
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{
				"error": "rate_limit_check_failed",
			})
			return
		}

		current := result[0].(int64)
		ttl := result[1].(int64)
		allowed := result[2].(int64)

		remaining := rlm.limit - int(current)
		c.Header("X-RateLimit-Limit", strconv.Itoa(rlm.limit))
		c.Header("X-RateLimit-Remaining", strconv.Itoa(remaining))
		c.Header("X-RateLimit-Reset", strconv.FormatInt(time.Now().Add(time.Duration(ttl)*time.Second).Unix(), 10))

		if allowed == 0 {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error":       "rate_limit_exceeded",
				"message":     "Too many requests. Please try again later.",
				"retry_after": ttl,
			})
			return
		}

		c.Next()
	}
}

func CloseRedis() {
	if redisClient != nil {
		redisClient.Close()
	}
}
