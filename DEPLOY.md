# Deployment Guide - Get Your Website Live!

This guide will help you deploy your CS2 Profits tracker to a hosting service so your friends can use it online.

## Quick Deploy Options

### Option 1: Railway (Easiest - Recommended)
Railway is free for hobby projects and very easy to use.

1. **Sign up** at https://railway.app (use GitHub to sign up)
2. **Create a new project** → "Deploy from GitHub repo"
3. **Connect your GitHub repository** with this code
4. **Add environment variables** in Railway:
   - `STEAM_API_KEY` - Your Steam API key
   - `STEAM_REALM` - Your Railway URL (e.g., `https://your-app-name.railway.app`)
   - `STEAM_RETURN_URL` - `https://your-app-name.railway.app/auth/steam/return`
   - `SESSION_SECRET` - Generate a random string (use: https://randomkeygen.com/)
   - `PORT` - Railway will set this automatically, but you can set it to `3000`
   - `NODE_ENV` - Set to `production`
5. **Deploy!** Railway will automatically install dependencies and start your app
6. **Update Steam API settings**: Go to https://steamcommunity.com/dev/apikey and update your domain to match your Railway URL

### Option 2: Render
Free tier available, similar to Railway.

1. **Sign up** at https://render.com
2. **Create a new Web Service**
3. **Connect your GitHub repository**
4. **Settings**:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment: `Node`
5. **Add environment variables** (same as Railway above)
6. **Deploy!**

### Option 3: Fly.io
Good free tier with global deployment.

1. **Install Fly CLI**: https://fly.io/docs/getting-started/installing-flyctl/
2. **Sign up**: `fly auth signup`
3. **Launch**: `fly launch` (in your project directory)
4. **Set secrets**: 
   ```bash
   fly secrets set STEAM_API_KEY=your_key
   fly secrets set SESSION_SECRET=your_secret
   fly secrets set STEAM_REALM=https://your-app.fly.dev
   fly secrets set STEAM_RETURN_URL=https://your-app.fly.dev/auth/steam/return
   fly secrets set NODE_ENV=production
   ```

## Important: Steam API Setup

**CRITICAL**: After deploying, you MUST update your Steam API key settings:

1. Go to https://steamcommunity.com/dev/apikey
2. Click on your API key
3. Update the **Domain Name** to match your deployed URL (e.g., `your-app.railway.app`)
4. Save changes

Without this, Steam login won't work!

## Getting Your Steam API Key

If you don't have one yet:

1. Go to https://steamcommunity.com/dev/apikey
2. Sign in with Steam
3. Enter your domain (use your deployed URL, or `localhost` for testing)
4. Copy the API key
5. Add it to your hosting platform's environment variables

## After Deployment

1. Visit your live URL
2. Click "Sign in through Steam"
3. You should be redirected to Steam, then back to your app
4. Share the URL with your friends!

## Free Tier Limits

- **Railway**: $5/month free credit (enough for a small app)
- **Render**: Free tier available (may spin down after inactivity)
- **Fly.io**: Generous free tier

## Troubleshooting

**"Steam login not working"**
- Check that `STEAM_REALM` and `STEAM_RETURN_URL` match your deployed URL exactly
- Make sure your Steam API key domain matches your deployment URL
- Check browser console for errors

**"Cannot connect to server"**
- Verify the app is running in your hosting dashboard
- Check the logs for errors
- Make sure `PORT` environment variable is set (most platforms set this automatically)

## Need Help?

- Railway docs: https://docs.railway.app
- Render docs: https://render.com/docs
- Fly.io docs: https://fly.io/docs
