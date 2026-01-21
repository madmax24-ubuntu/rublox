import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// Получаем директорию текущего модуля
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Создаем экземпляр приложения Express
const app = express();
const PORT = process.env.PORT || 3001; // Меняем порт с 3000 на 3001, т.к. 3000 уже занят

// Устанавливаем статический каталог
app.use(express.static(__dirname));

// Маршрут для корневого пути - отдаем index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Запускаем сервер
app.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
  console.log('Rublox Hunger Games в стиле Roblox готов к игре!');
  console.log('Нажмите Ctrl+C для завершения сервера');
});
