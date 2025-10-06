// backend/routes/extension.js
// Add these routes to your Express server

const express = require('express');
const router = express.Router();

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Verify token with your JWT verification logic
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// 1. Get daily limits for extension
router.get('/extension/limits', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Fetch user's settings from database
    const userSettings = await db.query(
      'SELECT site_limits FROM users WHERE id = $1',
      [userId]
    );
    
    if (!userSettings.rows[0]) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Return limits in seconds
    const limits = userSettings.rows[0].site_limits || {
      'instagram.com': 3600,    // 1 hour default
      'tiktok.com': 3600,
      'youtube.com': 7200,       // 2 hours
      'facebook.com': 3600,
      'twitter.com': 3600,
      'reddit.com': 3600,
      'netflix.com': 7200
    };
    
    res.json({ limits });
  } catch (error) {
    console.error('Error fetching limits:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 2. Sync usage data from extension
router.post('/extension/sync', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { usage, timestamp } = req.body;
    
    if (!usage || typeof usage !== 'object') {
      return res.status(400).json({ error: 'Invalid usage data' });
    }
    
    const today = new Date().toISOString().split('T')[0];
    
    // Update or insert usage records for each site
    for (const [site, seconds] of Object.entries(usage)) {
      await db.query(
        `INSERT INTO daily_usage (user_id, date, site, seconds_spent, source)
         VALUES ($1, $2, $3, $4, 'extension')
         ON CONFLICT (user_id, date, site)
         DO UPDATE SET 
           seconds_spent = GREATEST(daily_usage.seconds_spent, $4),
           updated_at = NOW()`,
        [userId, today, site, seconds]
      );
    }
    
    // Log sync event
    await db.query(
      `INSERT INTO sync_logs (user_id, timestamp, sites_synced)
       VALUES ($1, $2, $3)`,
      [userId, new Date(timestamp), Object.keys(usage).length]
    );
    
    res.json({ 
      success: true, 
      message: 'Usage synced successfully',
      synced_sites: Object.keys(usage).length 
    });
  } catch (error) {
    console.error('Error syncing usage:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// 3. Handle emergency access requests
router.post('/extension/emergency-access', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { site, reason } = req.body;
    
    if (!site || !reason) {
      return res.status(400).json({ 
        approved: false, 
        message: 'Site and reason are required' 
      });
    }
    
    // Log the request
    await db.query(
      `INSERT INTO emergency_access_requests (user_id, site, reason, timestamp)
       VALUES ($1, $2, $3, NOW())`,
      [userId, site, reason]
    );
    
    // Use AI to evaluate the request (using your existing Gemini integration)
    const aiEvaluation = await evaluateEmergencyRequest(reason, site);
    
    const response = {
      approved: aiEvaluation.approved,
      message: aiEvaluation.message,
      duration: aiEvaluation.approved ? 15 : 0 // 15 minutes if approved
    };
    
    // Log the decision
    await db.query(
      `UPDATE emergency_access_requests 
       SET approved = $1, ai_response = $2, processed_at = NOW()
       WHERE user_id = $3 AND site = $4 AND processed_at IS NULL`,
      [response.approved, response.message, userId, site]
    );
    
    res.json(response);
  } catch (error) {
    console.error('Error processing emergency access:', error);
    res.status(500).json({ 
      approved: false, 
      message: 'Error processing request. Please try again.' 
    });
  }
});

// AI Evaluation Function (integrate with your existing Gemini code)
async function evaluateEmergencyRequest(reason, site) {
  try {
    // Use your existing Gemini AI integration
    const prompt = `You are evaluating an emergency access request for a digital detox app.

User wants to access: ${site}
Their reason: "${reason}"

Evaluate if this is a legitimate emergency/urgent need. Approve ONLY if:
- It's work-related and urgent (deadline, important meeting)
- Educational necessity (homework, research due soon)
- Critical communication need
- Family/personal emergency

Deny if:
- Vague reason ("just need to check", "important")
- Entertainment/leisure
- FOMO-related
- Can wait until tomorrow

Respond in JSON format:
{
  "approved": true/false,
  "message": "Brief explanation for user (1 sentence)"
}`;

    const result = await geminiModel.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    // Fallback if parsing fails
    return {
      approved: false,
      message: 'Could not evaluate request. Please try again.'
    };
  } catch (error) {
    console.error('AI evaluation error:', error);
    return {
      approved: false,
      message: 'Error evaluating request. Please try again later.'
    };
  }
}

// Export router
module.exports = router;

// ============================================
// ADD TO YOUR MAIN SERVER.JS FILE:
// ============================================
/*

const extensionRoutes = require('./routes/extension');
app.use('/api', extensionRoutes);

*/