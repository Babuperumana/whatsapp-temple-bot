const { Client, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const socketIO = require("socket.io");
const moment = require('moment'); // For handling date input
const cors = require('cors');

const client = new Client();

app.use(cors());
const port = 3000;
let qrCodeSent = false;
let qrReady = false;

const io = socketIO(server, {
    cors: {
        origin: "http://localhost",
        methods: ["GET", "POST"]
    }
});

// Sample list of vazhipadus (offerings)
const vazhipadus = [
    { id: 1, name: 'Ganapathy Homam', price: 500, description: 'For prosperity and removing obstacles.' },
    { id: 2, name: 'Maha Mrityunjaya Homam', price: 1500, description: 'For health and longevity.' },
    { id: 3, name: 'Navagraha Pooja', price: 1000, description: 'For mitigating planetary effects.' },
];

let userSessions = {};

function displayVazhipadus() {
    let response = 'Available Vazhipadus (Offerings) with their rates:\n\n';
    vazhipadus.forEach(vazhipadu => {
        response += `*${vazhipadu.id}.* ${vazhipadu.name} - ₹${vazhipadu.price}\n${vazhipadu.description}\n\n`;
    });
    response += 'Reply with the number of the vazhipadu you want to add to your booking.';
    return response;
}

function confirmBooking(vazhipadu, date, name, star) {
    return `You have booked *${vazhipadu.name}* on *${date}* for ₹${vazhipadu.price}.\n\n` +
           `Booking Details:\nName: ${name}\nStar: ${star}\n\nThank you for your booking! May the divine blessings be with you.`;
}

function displayCart(cart) {
    if (cart.length === 0) {
        return 'Your booking cart is empty. Please add vazhipadus by selecting from the menu.';
    }

    let response = 'Your current booking cart:\n\n';
    cart.forEach((item, index) => {
        response += `${index + 1}. *${item.vazhipadu.name}* on *${item.date}* for ₹${item.vazhipadu.price}\n` +
                    `Name: ${item.name}, Star: ${item.star}\n`;
    });
    response += '\nReply with "confirm" to finalize your bookings, "remove <item number>" to remove an item, "edit <item number>" to edit an item, "clear" to clear all bookings, or "add" to add more vazhipadus.';
    return response;
}

// Greet new users with options
function greetingMessage() {
    return `🙏 Welcome to [Your Temple's Name]! 🙏\n\nPlease choose an option below:\n1. View Upcoming Events\n2. Book Vazhipadus Online\n\nReply with '1' for events or '2' for bookings.`;
}

io.on('connection', (socket) => {
    if (!qrCodeSent && !qrReady) {
        console.log('Sending QR code...');
        socket.emit('message', 'Generating QR Code');

        client.on('qr', (qr) => {
            qrcode.toDataURL(qr, (err, url) => {
                socket.emit('qr', url);
                socket.emit('message', 'generated');
            });
        });

        client.on('ready', () => {
            qrReady = true;
            socket.emit('qr', '');
            socket.emit('message', 'WhatsApp is ready!');
        });

        qrCodeSent = true;

        socket.on('disconnect', () => {
            client.removeAllListeners('qr');
            client.removeAllListeners('ready');
            qrCodeSent = false;
        });
    } else if (qrReady) {
        socket.emit('message', 'WhatsApp is ready!');
        socket.emit('qr', '');
    }

    client.on('message', async msg => {
        const chatId = msg.from;
        const messageText = msg.body.toLowerCase().trim();
        let userSession = userSessions[chatId] || { step: 'greet', cart: [] };

        // Send greeting message on first interaction
        if (!userSessions[chatId]) {
            userSessions[chatId] = userSession;
            client.sendMessage(chatId, greetingMessage());
            return;
        }

        // Handle user response to greeting
        if (userSession.step === 'greet') {
            if (messageText === '1') {
                client.sendMessage(chatId, 'Upcoming Events:\n1. Navaratri - 10 Oct\n2. Diwali - 4 Nov\n...More events...');
                userSession.step = 'done'; // Move to done after showing events
            } else if (messageText === '2') {
                client.sendMessage(chatId, displayVazhipadus());
                userSession.step = 'booking';
            } else {
                client.sendMessage(chatId, 'Invalid input. Please reply with "1" for events or "2" for bookings.');
            }
            return;
        }

        // Handle vazhipadu selection by number
        const selectedVazhipadu = vazhipadus.find(v => v.id.toString() === messageText);
        if (userSession.step === 'booking' && selectedVazhipadu) {
            userSession.selectedVazhipadu = selectedVazhipadu;
            userSession.step = 'name';
            client.sendMessage(chatId, `You have selected *${selectedVazhipadu.name}* which costs ₹${selectedVazhipadu.price}.\n\nPlease enter the person's name for the booking.`);
            return;
        }

        // Handle input of the person's name
        if (userSession.step === 'name') {
            userSession.name = msg.body.trim(); // Save the name
            userSession.step = 'star';
            client.sendMessage(chatId, `Got it! Now, please enter the person's star (nakshatra).`);
            return;
        }

        // Handle input of the person's star (nakshatra)
        if (userSession.step === 'star') {
            userSession.star = msg.body.trim(); // Save the star
            userSession.step = 'date';
            client.sendMessage(chatId, `Great! Please enter the date you want to book *${userSession.selectedVazhipadu.name}* for (in the format DD-MM-YYYY).`);
            return;
        }

        // Handle date input for each vazhipadu booking
        if (userSession.step === 'date' && moment(messageText, 'DD-MM-YYYY', true).isValid()) {
            const selectedDate = moment(messageText, 'DD-MM-YYYY').format('DD-MM-YYYY');
            userSession.cart.push({
                vazhipadu: userSession.selectedVazhipadu,
                date: selectedDate,
                name: userSession.name,
                star: userSession.star
            });
            userSession.step = 'addMore'; // Move to add more step
            client.sendMessage(chatId, `Added *${userSession.selectedVazhipadu.name}* on *${selectedDate}* to your booking cart.\n\nWould you like to add another vazhipadu? Reply with "yes" to add more or "no" to confirm your bookings.`);
            return;
        }

        // Handle adding more vazhipadus
        if (userSession.step === 'addMore') {
            if (messageText === 'yes') {
                userSession.step = 'booking';
                client.sendMessage(chatId, displayVazhipadus());
            } else if (messageText === 'no') {
                client.sendMessage(chatId, displayCart(userSession.cart));
                userSession.step = 'cart'; // Move to cart step after adding
            } else {
                client.sendMessage(chatId, 'Invalid input. Please reply with "yes" to add more vazhipadus or "no" to confirm your bookings.');
            }
            return;
        }

        // Handle viewing the current booking cart
        if (messageText === 'view cart') {
            client.sendMessage(chatId, displayCart(userSession.cart));
            return;
        }

        // Handle adding more vazhipadus
        if (messageText === 'add') {
            userSession.step = 'menu';
            client.sendMessage(chatId, 'Here is the list of available vazhipadus again:\n\n' + displayVazhipadus());
            return;
        }

        // Handle removing an item from the cart
        if (messageText.startsWith('remove ')) {
            const itemNumber = parseInt(messageText.replace('remove ', '')) - 1;
            if (userSession.cart[itemNumber]) {
                const removedItem = userSession.cart.splice(itemNumber, 1);
                client.sendMessage(chatId, `*${removedItem[0].vazhipadu.name}* has been removed from your cart.\n\n${displayCart(userSession.cart)}`);
            } else {
                client.sendMessage(chatId, 'Invalid item number. Please try again or reply with "view cart" to see the items in your cart.');
            }
            return;
        }

        // Handle editing an item in the cart
        if (messageText.startsWith('edit ')) {
            const itemNumber = parseInt(messageText.replace('edit ', '')) - 1;
            if (userSession.cart[itemNumber]) {
                userSession.selectedVazhipadu = userSession.cart[itemNumber].vazhipadu;
                userSession.name = userSession.cart[itemNumber].name;
                userSession.star = userSession.cart[itemNumber].star;
                userSession.cart.splice(itemNumber, 1); // Remove the item being edited
                userSession.step = 'date';
                client.sendMessage(chatId, `Editing *${userSession.selectedVazhipadu.name}*.\n\nPlease enter the new date (in the format DD-MM-YYYY).`);
            } else {
                client.sendMessage(chatId, 'Invalid item number. Please try again or reply with "view cart" to see the items in your cart.');
            }
            return;
        }

        // Handle clearing the cart
        if (messageText === 'clear') {
            userSession.cart = [];
            client.sendMessage(chatId, 'Your booking cart has been cleared. You can start adding new vazhipadus by selecting from the menu:\n\n' + displayVazhipadus());
            userSession.step = 'menu';
            return;
        }

        // Handle confirming all bookings in the cart
        if (userSession.step === 'cart' && messageText === 'confirm' && userSession.cart.length > 0) {
            const confirmationMessages = userSession.cart.map((item) => confirmBooking(item.vazhipadu, item.date, item.name, item.star)).join('\n\n');
            client.sendMessage(chatId, confirmationMessages);
            delete userSessions[chatId]; // Clear the session after confirming
            return;
        }

        // Handle invalid date input
        if (userSession.step === 'date' && !moment(messageText, 'DD-MM-YYYY', true).isValid()) {
            client.sendMessage(chatId, 'Invalid date format. Please enter the date in the format DD-MM-YYYY.');
            return;
        }

        // Handle invalid input or unrecognized commands
        client.sendMessage(chatId, 'Invalid input. Please follow the instructions provided or type "view cart" to manage your bookings.');
    });
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

client.initialize();

//Listen to server port
server.listen(port, () => {
    console.log("listening port " + port + "\nurl: http://localhost:" + port);
});
