const cards = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
// console.log("cards array before loop = ", cards);
const orderedArray = [[0]];
// orderedMessage = "";
const playersInVc = ["MR", "Mrs", "SIR", "Billy"];

for (let i = 0; i < playersInVc.length; i++) {
	const randomNumber = Math.floor(Math.random() * cards.length); // select random card index in cards.length

	console.log(`player ${i} : ${playersInVc[i]} , Card ${cards[randomNumber]}`);
	const thisPlayerAndCard = [cards[randomNumber], playersInVc[i]];

	// console.log(`This player and card:  ${thisPlayerAndCard}`);

	// if (orderedArray.length === 0) {
	// 	orderedArray.splice(0, 0, thisPlayerAndCard);
	// 	console.log(`First item added to Ordered array = ${orderedArray}`);
	// } else {
	for (let n = 0; n < orderedArray.length; n++) {
		console.log(
			`in loop ${n} \n current card number ${cards[randomNumber]} \n checking against ${orderedArray[n][0]}`,
		);
		console.log(
			`${cards[randomNumber]} > ${orderedArray[n][0]} = ${cards[randomNumber] > orderedArray[n][0]}`,
		);
		if (cards[randomNumber] > orderedArray[n][0]) {
			orderedArray.splice(n, 0, thisPlayerAndCard);
			break;
		}
	}
	cards.splice(randomNumber, 1); //remove selected card from card array
	// console.log(`cards array loop after loop ${i} = ${cards}`); //debugging cards array in case of not working
}
console.log(`ordered array (yes 0) = ${orderedArray}`);

endArray = orderedArray.length - 1;
console.log(`endArray value = ${orderedArray[endArray]}`);
orderedArray.splice(endArray, 1);

console.log(
	`\n --------\n ordered array in arrays = \n ${orderedArray[0]} \n ${orderedArray[1]} \n ${orderedArray[2]} \n ${orderedArray[3]} \n --------\n`,
);

console.log(`ordered array (nos 0) = ${orderedArray}`);
// orderedMessage = `Message: ${orderedArray.join("\n").join("-")}`;
orderedMessage = orderedArray.map((e) => e.join("-")).join(" \n");
console.log(orderedMessage);
// }
