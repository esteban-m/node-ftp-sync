const http = require('http');
const PromiseFtp = require('promise-ftp');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

//get ftp servers from json file
const ftpServers = JSON.parse(fs.readFileSync('ftp_servers.json', 'utf8'));

async function connectFtp(serverInfo, ftpInstance) {
  try {
    await ftpInstance.connect({
      host: serverInfo.server,
      user: serverInfo.user,
      password: serverInfo.password
    });
  } catch (err) {
    console.error('Error connecting to FTP server: ', err);
    throw err;
  }
}

async function closeFtp(ftpInstance) {
  try {
    await ftpInstance.end();
  } catch (err) {
    console.error('Error closing FTP connection: ', err);
    throw err;
  }
}

async function getFtpFileContent(ftp, filePath) {
  try {
    const stream = await ftp.get(filePath);
    const chunks = [];
    for await (let chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  } catch (err) {
    console.error('Error getting file content: ', err);
    throw err;
  }
}

async function putFtpFileContent(ftp, filePath, content) {
  try {
    const tempFilePath = path.join(__dirname, 'temp.json');
    fs.writeFileSync(tempFilePath, content, { encoding: 'utf8' });
    await ftp.put(fs.createReadStream(tempFilePath), filePath);
    fs.unlinkSync(tempFilePath); // Delete the temp file
  } catch (err) {
    console.error('Error putting file content: ', err);
    throw err;
  }
}

async function deleteFtpFile(ftp, filePath) {
  try {
    await ftp.delete(filePath);
  } catch (err) {
    console.error('Error deleting file: ', err);
    throw err;
  }
}

async function synchronize() {
  for (let serverInfo of ftpServers) {
    const ftp = new PromiseFtp();
    await connectFtp(serverInfo, ftp);

    const ordersPath = 'orders.json';
    const actionsPath = 'actions.json';
    console.log("[" + serverInfo.server + "] step 1");
    // Create files if they don't exist
    try {
      await ftp.get(ordersPath);
      console.log("[" + serverInfo.server + "] step 2.1");
    } catch (err) {
      await putFtpFileContent(ftp, ordersPath, '[]');
      console.log("[" + serverInfo.server + "] error 2.1" + err);
    }
    try {
      await ftp.get(actionsPath);
      console.log("[" + serverInfo.server + "] step 2.2");
    } catch (err) {
      await putFtpFileContent(ftp, actionsPath, '[]');
      console.log("[" + serverInfo.server + "] error 2.2" + err);
    }

    // Fetch and parse the current orders and actions
    const ordersContent = await getFtpFileContent(ftp, ordersPath);
    const actionsContent = await getFtpFileContent(ftp, actionsPath);
    const orders = JSON.parse(ordersContent);
    const actions = JSON.parse(actionsContent);

    console.log("[" + serverInfo.server + "] step 3");

    // Synchronize the data
    actions.forEach(action => {
      const orderIds = action.order_ids.split(',');

      switch (action.action) {
        case 'add':
          console.log("[" + serverInfo.server + "] step 4.1");
          // Add orders that are not already in the list
          orderIds.forEach(orderId => {
            if (!orders.find(order => order.id === orderId)) {
              // Retrieve the new order from somewhere. Here I'm just creating a dummy order
              const newOrder = { id: orderId, account_id: 'dummy_account', status: 'new' };
              orders.push(newOrder);
            }
          });
          break;
        case 'rm':
          console.log("[" + serverInfo.server + "] step 4.2");
          // Remove orders that are in the list
          orderIds.forEach(orderId => {
            const orderIndex = orders.findIndex(order => order.id === orderId);
            if (orderIndex !== -1) {
              orders.splice(orderIndex, 1);
            }
          });
          break;
        default:
          console.error(`Unknown action: ${action.action}`);
          break;
      }
    });

    // Save the updated orders
    await putFtpFileContent(ftp, ordersPath, JSON.stringify(orders));

    // Once synchronization is complete, clear the actions
    actions.length = 0;
    await putFtpFileContent(ftp, actionsPath, JSON.stringify(actions));
    console.log("[" + serverInfo.server + "] step 5");
    await closeFtp(ftp);
  }
}

cron.schedule('*/5 * * * *', function() {
  console.log('Running the synchronization task...');
  synchronize().catch(err => console.error(err));
});

const httpServer = http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('Online\n');
});

const port = process.env.PORT || 3000;

httpServer.listen(port, '0.0.0.0', err => {
  if (err) throw err;
  console.log(`Listening on port ${port}`);
});
