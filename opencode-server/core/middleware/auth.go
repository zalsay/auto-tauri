package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

var jwtSecret []byte

func InitAuth(secret string) {
	jwtSecret = []byte(secret)
}

type Claims struct {
	UserID string `json:"sub"`
	jwt.RegisteredClaims
}

func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatus(401)
			return
		}
		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(t *jwt.Token) (interface{}, error) {
			return jwtSecret, nil
		})
		if err != nil || token == nil {
			c.AbortWithStatus(401)
			return
		}
		if claims, ok := token.Claims.(*Claims); ok && token.Valid {
			c.Set("userID", claims.UserID)
			c.Next()
		} else {
			c.AbortWithStatus(401)
		}
	}
}

func GetUserID(c *gin.Context) string {
	if userID, exists := c.Get("userID"); exists {
		return userID.(string)
	}
	return ""
}

func RequireRole(role string) gin.HandlerFunc {
	return func(c *gin.Context) {
		userRole := c.GetHeader("X-User-Role")
		if userRole != role {
			c.AbortWithStatus(403)
			return
		}
		c.Next()
	}
}
