// vazhipadus.js
const vazhipadus = [
    { id: 1, name: 'Ganapathy Homam', price: 500, description: 'For prosperity and removing obstacles.' },
    { id: 2, name: 'Maha Mrityunjaya Homam', price: 1500, description: 'For health and longevity.' },
    { id: 3, name: 'Navagraha Pooja', price: 1000, description: 'For mitigating planetary effects.' },
];

function displayVazhipadus() {
    let response = 'Available Vazhipadus (Offerings) with their rates:\n\n';
    vazhipadus.forEach(vazhipadu => {
        response += `*${vazhipadu.id}.* ${vazhipadu.name} - ₹${vazhipadu.price}\n${vazhipadu.description}\n\n`;
    });
    response += 'Reply with the number of the vazhipadu you want to add to your booking.';
    return response;
}

module.exports = { vazhipadus, displayVazhipadus };
