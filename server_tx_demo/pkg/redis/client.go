package redis

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/go-redis/redis/v8"
)

type RedisClient struct {
	client *redis.Client
}

func NewRedisClient(addr, password string, db int) *RedisClient {
	return &RedisClient{
		client: redis.NewClient(&redis.Options{
			Addr:         addr,
			Password:     password,
			DB:           db,
			PoolSize:     10,
			MinIdleConns: 5,
		}),
	}
}

func (r *RedisClient) Close() error {
	return r.client.Close()
}

func (r *RedisClient) Ping(ctx context.Context) error {
	return r.client.Ping(ctx).Err()
}

// Idempotency Key 模式：使用 SETNX 实现幂等性控制
// key: idempotency:{operation}:{idempotency_key}
// value: {result or status}
// NX: 仅在 key 不存在时设置
// EX: 过期时间
func (r *RedisClient) AcquireIdempotencyKey(
	ctx context.Context,
	operation string,
	idempotencyKey string,
	ttl time.Duration,
) (acquired bool, existingResult string, err error) {
	key := fmt.Sprintf("idempotency:%s:%s", operation, idempotencyKey)

	result, err := r.client.SetNX(ctx, key, "processing", ttl).Result()
	if err != nil {
		return false, "", fmt.Errorf("failed to set idempotency key: %w", err)
	}

	if !result {
		// Key 已存在，获取已有结果
		existingResult, err = r.client.Get(ctx, key).Result()
		if err != nil {
			return false, "", fmt.Errorf("failed to get existing result: %w", err)
		}
		return false, existingResult, nil
	}

	return true, "", nil
}

// 完成幂等操作，写入结果
func (r *RedisClient) CompleteIdempotencyKey(
	ctx context.Context,
	operation string,
	idempotencyKey string,
	result interface{},
) error {
	key := fmt.Sprintf("idempotency:%s:%s", operation, idempotencyKey)

	resultStr, err := json.Marshal(result)
	if err != nil {
		return fmt.Errorf("failed to marshal result: %w", err)
	}

	// 使用 SET 覆盖结果
	return r.client.Set(ctx, key, string(resultStr), 24*time.Hour).Err()
}

// 释放幂等锁（用于补偿操作）
func (r *RedisClient) ReleaseIdempotencyKey(
	ctx context.Context,
	operation string,
	idempotencyKey string,
) error {
	key := fmt.Sprintf("idempotency:%s:%s", operation, idempotencyKey)
	return r.client.Del(ctx, key).Err()
}

// 分布式锁
func (r *RedisClient) AcquireLock(
	ctx context.Context,
	lockName string,
	requestID string,
	ttl time.Duration,
) (acquired bool, err error) {
	key := fmt.Sprintf("lock:%s", lockName)

	result, err := r.client.SetNX(ctx, key, requestID, ttl).Result()
	if err != nil {
		return false, fmt.Errorf("failed to acquire lock: %w", err)
	}

	return result, nil
}

// 释放分布式锁（使用 Lua 脚本确保只能释放自己的锁）
func (r *RedisClient) ReleaseLock(ctx context.Context, lockName string, requestID string) error {
	key := fmt.Sprintf("lock:%s", lockName)

	script := redis.NewScript(`
		if redis.call("get", KEYS[1]) == ARGV[1] then
			return redis.call("del", KEYS[1])
		else
			return 0
		end
	`)

	return script.Run(ctx, r.client, []string{key}, requestID).Err()
}

// 分布式锁续期
func (r *RedisClient) ExtendLock(ctx context.Context, lockName string, requestID string, ttl time.Duration) error {
	key := fmt.Sprintf("lock:%s", lockName)

	script := redis.NewScript(`
		if redis.call("get", KEYS[1]) == ARGV[1] then
			return redis.call("pexpire", KEYS[1], ARGV[2])
		else
			return 0
		end
	`)

	return script.Run(ctx, r.client, []string{key}, requestID, ttl.Milliseconds()).Err()
}

// 计数器（用于限流、统计）
func (r *RedisClient) Incr(ctx context.Context, key string) (int64, error) {
	return r.client.Incr(ctx, key).Result()
}

func (r *RedisClient) Expire(ctx context.Context, key string, ttl time.Duration) error {
	return r.client.Expire(ctx, key, ttl).Err()
}
