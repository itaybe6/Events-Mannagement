export const basicPingTest = async () => {
  try {
    const res = await fetch('https://yzsfozjrhznlqecgqgqr.supabase.co/rest/v1/', {
      headers: {
        apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6c2ZvempyaHpubGVxY2dnb3FyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI5OTQ4MDUsImV4cCI6MjA2ODU3MDgwNX0.glvsNPiabWP4S9ECdHMsTrjmjujKEYXYhoQMm5CRwxk',
        Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6c2ZvempyaHpubGVxY2dnb3FyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI5OTQ4MDUsImV4cCI6MjA2ODU3MDgwNX0.glvsNPiabWP4S9ECdHMsTrjmjujKEYXYhoQMm5CRwxk',
      }
    });
    console.log('✅ response.ok =', res.ok);
    console.log('✅ status =', res.status);
  } catch (err) {
    console.log('❌ FETCH FAILED:', err);
  }
}; 