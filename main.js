var R = require('ramda'),
	request = require('request-promise');

var baseUrl = 'http://resttest.bench.co/transactions/';
var getTransactions = R.prop('transactions');
var getTotalCount = R.prop('totalCount');
var vendorLens = R.lens(R.prop('Company'), R.assoc('Company'));
var cleanTransaction = R.over(vendorLens, cleanVendorName);

function pageRequest(pageNo, txCount, transactions) {
	var paginatedUrl = [ baseUrl, pageNo, '.json' ].join('');
	request({ 
		uri: paginatedUrl,
		json: true
	})
	.then(function(response) {
		console.log('Received page: ', pageNo);
		txCount += R.length(getTransactions(response));
		var currentTx = R.concat(transactions, getTransactions(response));
		var totalTx = getTotalCount(response);
		if (txCount < totalTx) {
			var nextPage = R.inc(pageNo);
			pageRequest(nextPage, txCount, currentTx);
		} else {
			console.error('All data received\nExpected Tx: '+ totalTx + '\nReceived Tx: '+ txCount);
			onDataRetrieved(currentTx);
		}
	})
	.catch(function(error) {
		console.error(error);
	});
}

function onDataRetrieved(transactions) {
	console.log('Total Balance: ', totalBalance(transactions));
	var cleanedVendorTx = R.map(cleanTransaction, transactions);
	console.log('Cleaned Vendor Names:\n', R.pluck('Company', cleanedVendorTx));
	console.log('Categorical Expense Totals:\n', getCategoricalExpenseSummaries(transactions));
	console.log('Running Daily Balances:\n', calculateDailyBalances(transactions));
	console.log('Duplicated Transactions:\n:', getDuplicates(transactions));
}


// Initiate Requests
pageRequest(1, 0, []);

// We would like you to write an app that connects to an API, downloads all the data, and has a function that will calculate the total balance.
var totalBalance = R.pipe(R.pluck('Amount'), R.reduce(R.add, 0));

// As a user, I need vendor names to be easily readable. Make the vendor names more readable, remove garbage from names.
function cleanVendorName(name) {
	var capitalizeWord = R.converge(
		R.concat, [
			R.pipe(R.toUpper, R.slice(0,1)), 
			R.slice(1, R.dec(R.length(name)))
		]
	);	
	var cleanWord = R.pipe(R.trim, R.toLower, capitalizeWord);
	var garbageFilter = R.pipe(R.test(/^([xX#]{2,}|@)/), R.not);
	return R.pipe(
		R.split(' '),
		R.map(cleanWord),
		R.filter(garbageFilter),
		R.join(' ')
	)(name);
}

// As a user, I need to get a list expense categories. For each category I need a list of transactions, and the total expenses for that category.
var getCategoryTotal = R.pipe(R.pluck('Amount'), R.reduce(R.add, 0));
function getCategoricalExpenseSummaries(transactions) {
	var categories = R.groupBy(R.prop('Ledger'), transactions);
	categories = R.assoc('Uncategorized', categories[''], categories);
	categories = R.dissoc('', categories);
	return R.map(getCategoryTotal, categories);
}

// As a user, I do not want to have any duplicated transactions in the list. Use the data provided to detect and identify duplicate transactions.
var dailyTx = R.groupBy(R.prop('Date'));
function checkDailyDuplicates(transactions, date) {
	var result = [];
	for (var i = 0; i < transactions.length; i++) {
		if (i < transactions.length - 1 && transactions[i].Amount === transactions[i + 1].Amount) {
			result = R.concat([transactions[i], transactions[i+1]], result);
		}
	}
	return result;
}
function getDuplicates(transactions) {
	var amountToFloat = R.pipe(R.prop('Amount'), parseFloat);
	var txByDateSorted = R.map(R.sortBy(amountToFloat), dailyTx(transactions));
	var result = R.mapObjIndexed(checkDailyDuplicates, txByDateSorted);
	return R.filter(R.pipe(R.isEmpty, R.not), result);
}

function createSortable(amount, dateString) {
	return {
		date: +new Date(dateString),
		dateString: dateString,
		amount: amount
	}
}

// As a user, I need to calculate daily calculated balances. A running total for each day. For example, if I have 3 transactions for the 5th 6th 7th, each for $5, then the daily balance on the 6th would be $10.
var getDailyTotal = R.pipe(R.pluck('Amount'), R.reduce(R.add, 0));
function calculateDailyBalances(transactions) {
	var dailyTotals = R.map(getDailyTotal, dailyTx(transactions));
	var sorted = R.pipe(
		R.mapObjIndexed(createSortable),
		R.values,
		R.sortBy(R.prop('date'))
	)(dailyTotals);
	var result = R.mapAccum(function(accum, value) {
		var newAccum = R.add(value.amount, accum);
		return [ newAccum, R.assoc(value.dateString, newAccum, {}) ];
	}, 0, sorted);
	return result[1]; // result = [ accum, value ]
}
