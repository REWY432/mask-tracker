import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createClient } from '@supabase/supabase-js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Environment checks
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const expectedAuthCode = process.env.APP_SECRET_CODE || '';

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Auth Middleware
  const requireAuthCode = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authCode = req.headers['x-auth-code'];
    if (!expectedAuthCode) {
      next(); // If not configured, allow access (or maybe block? Let's just allow if missing for dev ease)
    } else if (authCode === expectedAuthCode) {
      next();
    } else {
      res.status(401).json({ error: 'Неверный код авторизации' });
    }
  };

  // Setup database table on startup (if missing) or provide instruction
  // Actually Supabase doesn't easily let you run DDL from RPC without setup. We will just try to query it.
  
  // API Routes
  
  // Validate token
  app.post('/api/auth/validate', (req, res) => {
    const { code } = req.body;
    if (code === expectedAuthCode || !expectedAuthCode) {
      res.json({ success: true });
    } else {
      res.json({ success: false });
    }
  });

  // Get all masks
  app.get('/api/masks', requireAuthCode, async (req, res) => {
    const { data, error } = await supabase
      .from('masks')
      .select('*')
      .order('sequence', { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message });
    } else {
      res.json(data);
    }
  });

  // Add new mask(s)
  app.post('/api/masks', requireAuthCode, async (req, res) => {
    const records = Array.isArray(req.body) ? req.body : [req.body];
    
    // We expect the array of records
    const { data, error } = await supabase
      .from('masks')
      .insert(records)
      .select();

    if (error) {
      res.status(500).json({ error: error.message });
    } else {
      res.json(data);
    }
  });

  // Update mask
  app.put('/api/masks/:id', requireAuthCode, async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    
    // Do not allow updating id
    delete updates.id;

    const { data, error } = await supabase
      .from('masks')
      .update(updates)
      .eq('id', id)
      .select();

    if (error) {
      res.status(500).json({ error: error.message });
    } else {
      res.json(data);
    }
  });

  // Delete mask
  app.delete('/api/masks/:id', requireAuthCode, async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase
      .from('masks')
      .delete()
      .eq('id', id);

    if (error) {
      res.status(500).json({ error: error.message });
    } else {
      res.json({ success: true });
    }
  });
  
  // Get next available sequence
  app.get('/api/sequence', requireAuthCode, async (req, res) => {
    // Determine the max sequence
    const { data, error } = await supabase
      .from('masks')
      .select('sequence')
      .order('sequence', { ascending: false })
      .limit(1);
      
    if (error && error.code !== '42P01') { // Ignore missing table error
      res.status(500).json({ error: error.message });
    } else {
      const nextSeq = data && data.length > 0 ? data[0].sequence + 1 : 1590; // Defaulting to 1590 as requested in preview
      res.json({ nextSequence: nextSeq });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
