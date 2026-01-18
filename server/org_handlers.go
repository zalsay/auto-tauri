package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Organization Request Types

type CreateOrganizationRequest struct {
	Name string `json:"name" binding:"required"`
}

type UpdateOrganizationRequest struct {
	Name           *string `json:"name"`
	BillingAdminID *string `json:"billingAdminId"`
}

type AddOrgMemberRequest struct {
	UserID string `json:"userId" binding:"required"`
	Role   string `json:"role"` // "user" or "org_admin"
}

type SetBillingAdminRequest struct {
	BillingAdminID string `json:"billingAdminId" binding:"required"`
}

type AddToBlacklistRequest struct {
	UserID string `json:"userId" binding:"required"`
	Reason string `json:"reason"`
}

type SetSystemBlacklistRequest struct {
	Blacklisted bool `json:"blacklisted"`
}

// Middleware

// blacklistMiddleware checks if user is system-blacklisted
func blacklistMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(string)
		user, err := GetUserWithCache(userID)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "user_not_found"})
			return
		}
		if user.IsBlacklisted {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "user_blacklisted"})
			return
		}
		c.Next()
	}
}

// requireRole middleware checks if user has required role
func requireRole(roles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(string)
		user, err := GetUserWithCache(userID)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "user_not_found"})
			return
		}
		for _, role := range roles {
			if user.Role == role {
				c.Set("user", user)
				c.Next()
				return
			}
		}
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "insufficient_permissions"})
	}
}

// Organization Handlers

func createOrganizationHandler(c *gin.Context) {
	var req CreateOrganizationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request"})
		return
	}

	org := Organization{
		ID:   uuid.NewString(),
		Name: req.Name,
	}

	if err := globalDB.Create(&org).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed_to_create_organization"})
		return
	}

	c.JSON(http.StatusCreated, org)
}

func getOrganizationsHandler(c *gin.Context) {
	var orgs []Organization
	globalDB.Find(&orgs)
	c.JSON(http.StatusOK, orgs)
}

func getOrganizationHandler(c *gin.Context) {
	orgID := c.Param("id")
	var org Organization
	if err := globalDB.Where("id = ?", orgID).First(&org).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "organization_not_found"})
		return
	}
	c.JSON(http.StatusOK, org)
}

func updateOrganizationHandler(c *gin.Context) {
	orgID := c.Param("id")
	var req UpdateOrganizationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request"})
		return
	}

	updates := make(map[string]interface{})
	if req.Name != nil {
		updates["name"] = *req.Name
	}
	if req.BillingAdminID != nil {
		if *req.BillingAdminID == "" {
			updates["billing_admin_id"] = nil
		} else {
			updates["billing_admin_id"] = *req.BillingAdminID
		}
	}

	if err := globalDB.Model(&Organization{}).Where("id = ?", orgID).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed_to_update_organization"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "organization_updated"})
}

func deleteOrganizationHandler(c *gin.Context) {
	orgID := c.Param("id")
	if err := globalDB.Where("id = ?", orgID).Delete(&Organization{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed_to_delete_organization"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "organization_deleted"})
}

// Organization Member Handlers

func addOrgMemberHandler(c *gin.Context) {
	orgID := c.Param("id")
	var req AddOrgMemberRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request"})
		return
	}

	// Verify organization exists
	var org Organization
	if err := globalDB.Where("id = ?", orgID).First(&org).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "organization_not_found"})
		return
	}

	role := req.Role
	if role == "" {
		role = "user"
	}

	// Update user's organization and role
	updates := map[string]interface{}{
		"organization_id": orgID,
		"role":            role,
	}

	result := globalDB.Model(&User{}).Where("id = ?", req.UserID).Updates(updates)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed_to_add_member"})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "user_not_found"})
		return
	}

	InvalidateUserCacheByID(req.UserID)
	c.JSON(http.StatusOK, gin.H{"message": "member_added"})
}

func removeOrgMemberHandler(c *gin.Context) {
	userID := c.Param("userId")

	updates := map[string]interface{}{
		"organization_id": nil,
		"role":            "user",
	}

	result := globalDB.Model(&User{}).Where("id = ?", userID).Updates(updates)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed_to_remove_member"})
		return
	}

	InvalidateUserCacheByID(userID)
	c.JSON(http.StatusOK, gin.H{"message": "member_removed"})
}

func getOrgMembersHandler(c *gin.Context) {
	orgID := c.Param("id")
	var users []User
	globalDB.Where("organization_id = ?", orgID).Find(&users)

	// Return safe user data without password hash
	type SafeUser struct {
		ID             string  `json:"id"`
		Email          string  `json:"email"`
		OrganizationID *string `json:"organizationId"`
		Role           string  `json:"role"`
		Balance        int64   `json:"balance"`
		IsBlacklisted  bool    `json:"isBlacklisted"`
	}

	safeUsers := make([]SafeUser, len(users))
	for i, u := range users {
		safeUsers[i] = SafeUser{
			ID:             u.ID,
			Email:          u.Email,
			OrganizationID: u.OrganizationID,
			Role:           u.Role,
			Balance:        u.Balance,
			IsBlacklisted:  u.IsBlacklisted,
		}
	}

	c.JSON(http.StatusOK, safeUsers)
}

// Billing Admin Handler

func setBillingAdminHandler(c *gin.Context) {
	orgID := c.Param("id")
	var req SetBillingAdminRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request"})
		return
	}

	// Verify billing admin belongs to this organization
	var user User
	if err := globalDB.Where("id = ? AND organization_id = ?", req.BillingAdminID, orgID).First(&user).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user_not_in_organization"})
		return
	}

	if err := globalDB.Model(&Organization{}).Where("id = ?", orgID).Update("billing_admin_id", req.BillingAdminID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed_to_set_billing_admin"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "billing_admin_set"})
}

// Organization Blacklist Handlers

func addToOrgBlacklistHandler(c *gin.Context) {
	orgID := c.Param("id")
	blockedBy := c.MustGet("userID").(string)

	var req AddToBlacklistRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request"})
		return
	}

	blacklistEntry := OrgUserBlacklist{
		ID:             uuid.NewString(),
		OrganizationID: orgID,
		UserID:         req.UserID,
		BlockedBy:      blockedBy,
		Reason:         req.Reason,
	}

	if err := globalDB.Create(&blacklistEntry).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed_to_add_to_blacklist"})
		return
	}

	c.JSON(http.StatusCreated, blacklistEntry)
}

func removeFromOrgBlacklistHandler(c *gin.Context) {
	orgID := c.Param("id")
	userID := c.Param("userId")

	result := globalDB.Where("organization_id = ? AND user_id = ?", orgID, userID).Delete(&OrgUserBlacklist{})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed_to_remove_from_blacklist"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "removed_from_blacklist"})
}

func getOrgBlacklistHandler(c *gin.Context) {
	orgID := c.Param("id")
	var blacklist []OrgUserBlacklist
	globalDB.Where("organization_id = ?", orgID).Find(&blacklist)
	c.JSON(http.StatusOK, blacklist)
}

// System Blacklist Handler (Super Admin)

func setSystemBlacklistHandler(c *gin.Context) {
	targetUserID := c.Param("id")
	var req SetSystemBlacklistRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request"})
		return
	}

	if err := globalDB.Model(&User{}).Where("id = ?", targetUserID).Update("is_blacklisted", req.Blacklisted).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed_to_update_blacklist_status"})
		return
	}

	InvalidateUserCacheByID(targetUserID)
	c.JSON(http.StatusOK, gin.H{"message": "blacklist_status_updated", "blacklisted": req.Blacklisted})
}

// Helper function to get effective balance holder (user or org billing admin)
func getEffectiveBalanceHolder(userID string) (*User, *Organization, error) {
	var user User
	if err := globalDB.Where("id = ?", userID).First(&user).Error; err != nil {
		return nil, nil, err
	}

	// If user doesn't belong to an organization, use their own balance
	if user.OrganizationID == nil {
		return &user, nil, nil
	}

	// Get the organization
	var org Organization
	if err := globalDB.Where("id = ?", *user.OrganizationID).First(&org).Error; err != nil {
		// Org not found, fall back to user balance
		return &user, nil, nil
	}

	// If billing admin is set, use billing admin's balance
	if org.BillingAdminID != nil {
		var billingAdmin User
		if err := globalDB.Where("id = ?", *org.BillingAdminID).First(&billingAdmin).Error; err == nil {
			return &billingAdmin, &org, nil
		}
	}

	// Otherwise use organization balance - return org and nil user to indicate org billing
	return nil, &org, nil
}

// DeductBalance deducts balance from the appropriate source (user, billing admin, or org)
func DeductBalance(tx *gorm.DB, userID string, amount int64) error {
	user, org, err := getEffectiveBalanceHolder(userID)
	if err != nil {
		return err
	}

	if user != nil {
		// Deduct from user (either personal balance or billing admin)
		if user.Balance < amount {
			return errInsufficientBalance
		}
		user.Balance -= amount
		return tx.Save(user).Error
	}

	if org != nil {
		// Deduct from organization balance
		if org.Balance < amount {
			return errInsufficientBalance
		}
		org.Balance -= amount
		return tx.Save(org).Error
	}

	return errInsufficientBalance
}

// CheckBalance checks if there's sufficient balance
func CheckBalance(userID string, amount int64) error {
	user, org, err := getEffectiveBalanceHolder(userID)
	if err != nil {
		return err
	}

	if user != nil && user.Balance >= amount {
		return nil
	}
	if org != nil && org.Balance >= amount {
		return nil
	}

	return errInsufficientBalance
}

// Recharge Organization Balance Handler
func rechargeOrganizationHandler(c *gin.Context) {
	orgID := c.Param("id")

	var req struct {
		Amount      int64  `json:"amount" binding:"required"`
		Description string `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request"})
		return
	}

	if err := globalDB.Model(&Organization{}).Where("id = ?", orgID).Update("balance", gorm.Expr("balance + ?", req.Amount)).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed_to_recharge"})
		return
	}

	var org Organization
	globalDB.Where("id = ?", orgID).First(&org)
	c.JSON(http.StatusOK, gin.H{"balance": org.Balance})
}
