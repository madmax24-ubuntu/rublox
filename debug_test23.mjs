import http from 'http';

// Check main.js response headers
http.get('http://localhost:3001/main.js', res => {
    console.log('Status:', res.statusCode);
    console.log('Content-Type:', res.headers['content-type']);
    console.log('Content-Encoding:', res.headers['content-encoding']);
    console.log('Cache-Control:', res.headers['cache-control']);

    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log('\nFirst 300 chars:');
        console.log(data.substring(0, 300));
        console.log('\nLast 100 chars:');
        console.log(data.substring(data.length - 100));
    });
}).on('error', e => {
    console.log('Error:', e.message);
});
