package config

import (
	"fmt"
	"strings"

	"github.com/spf13/viper"
)

type Config struct {
	Server   ServerConfig   `mapstructure:"server"`
	Database DatabaseConfig `mapstructure:"database"`
	Redis    RedisConfig    `mapstructure:"redis"`
	OSS      OSSConfig      `mapstructure:"oss"`
	Auth     AuthConfig     `mapstructure:"auth"`
	Logging  LoggingConfig  `mapstructure:"logging"`
}

type ServerConfig struct {
	Port    string `mapstructure:"port"`
	Timeout int    `mapstructure:"timeout"`
}

type DatabaseConfig struct {
	Host            string `mapstructure:"host"`
	Port            int    `mapstructure:"port"`
	Username        string `mapstructure:"username"`
	Password        string `mapstructure:"password"`
	Name            string `mapstructure:"name"`
	SSLMode         string `mapstructure:"sslmode"`
	MaxOpenConns    int    `mapstructure:"maxOpenConns"`
	MaxIdleConns    int    `mapstructure:"maxIdleConns"`
	ConnMaxLifetime int    `mapstructure:"connMaxLifetime"`
}

type RedisConfig struct {
	Host     string `mapstructure:"host"`
	Port     int    `mapstructure:"port"`
	Password string `mapstructure:"password"`
	DB       int    `mapstructure:"db"`
	PoolSize int    `mapstructure:"poolSize"`
}

type OSSConfig struct {
	Enabled         bool   `mapstructure:"enabled"`
	Endpoint        string `mapstructure:"endpoint"`
	AccessKeyID     string `mapstructure:"accessKeyID"`
	AccessKeySecret string `mapstructure:"accessKeySecret"`
	Bucket          string `mapstructure:"bucket"`
	Region          string `mapstructure:"region"`
	Domain          string `mapstructure:"domain"`
	PresignExpiry   int64  `mapstructure:"presignExpiry"`
	MaxFileSize     int64  `mapstructure:"maxFileSize"`
}

type AuthConfig struct {
	JWT JWTConfig `mapstructure:"jwt"`
}

type JWTConfig struct {
	Secret string `mapstructure:"secret"`
	Expiry string `mapstructure:"expiry"`
}

type LoggingConfig struct {
	Level  string `mapstructure:"level"`
	Format string `mapstructure:"format"`
}

func (d *DatabaseConfig) DSN() string {
	return fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		d.Host, d.Port, d.Username, d.Password, d.Name, d.SSLMode)
}

func (r *RedisConfig) Addr() string {
	return fmt.Sprintf("%s:%d", r.Host, r.Port)
}

func Load() (*Config, error) {
	v := viper.New()

	v.SetConfigName("default")
	v.AddConfigPath("./configs")
	v.AddConfigPath(".")

	v.SetEnvPrefix("OPENCODE")
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()

	if err := v.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return nil, fmt.Errorf("failed to read config file: %w", err)
		}
	}

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("failed to unmarshal config: %w", err)
	}

	if cfg.Server.Port == "" {
		cfg.Server.Port = "3000"
	}
	if cfg.Database.MaxOpenConns == 0 {
		cfg.Database.MaxOpenConns = 100
	}
	if cfg.Database.MaxIdleConns == 0 {
		cfg.Database.MaxIdleConns = 10
	}
	if cfg.Redis.PoolSize == 0 {
		cfg.Redis.PoolSize = 10
	}

	return &cfg, nil
}
