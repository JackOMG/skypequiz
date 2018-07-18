const restify = require('restify');
const builder = require('botbuilder');
const MongoClient = require('mongodb').MongoClient;


global.db=null; //database handle
//MongoClient.connect(process.env.mongoConnect||"mongodb://localhost:27017", function(err, database) {
MongoClient.connect(process.env.mongoConnect, function(err, client) {
  if(!err) {
    console.log("DB connected");
	db = client.db('gaming');
  } else console.log(err.stack);
});

//=========================================================
// Bot Setup
//=========================================================

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
   console.log('%s listening to %s', server.name, server.url); 
});
  
// Create chat bot
var connector = new builder.ChatConnector({
    //appId: 'bd3601c2-5e28-4734-9f4a-9526943b1c44',
    //appPassword: 'eW8#^%lhttbjZQKVIK5083#',
	appId: 'adcec96c-d7db-4e0a-bb81-ab60f8964ed6',
	appPassword:'viqzEJ1_!]admVIAHZ3193[',
});
var bot = new builder.UniversalBot(connector);
server.post('/api/messages', connector.listen());

var inMemoryStorage = new builder.MemoryBotStorage();

var bot = new builder.UniversalBot(connector).set('storage', inMemoryStorage); // Register in memory storage

var savedAddress;
var arr;
var quizQuestion;
var correctAnswer;

server.post('/api/messages', connector.listen());

// example of custom web api
server.get('/api/CustomWebApi', (req, res, next) => {
	if (saveAddress) {
		bot.beginDialog(savedAddress, '*:askQuestion');
		res.send('triggered');
	} else res.send('No group address saved');
    next();
  }
);

bot.dialog('setgroup', 
    function (session) {
		savedAddress = session.message.address;
		session.send('Group address has been set');
		console.log('Quiz address:'+savedAddress);
	}
).triggerAction({matches: /^setgroup$/i});


bot.dialog('newquiz', 
    function (session) {
		session.send('OK, lets create a new quiz question');
		session.beginDialog('createQuizQuestion');
	}
).triggerAction({matches: /^newquiz$/i});

bot.dialog('askquiz', 
    function (session) {
		// retrieve a quiz question from the database
		db.collection('quizquestion').findAndModify(
			{}, // query
			[['lastAsked','asc']],  // sort order
			{$set: {lastAsked: (new Date()).getTime()}}, // replacement, replaces only the field "lastAsked"
			{},
			function(err, quiz) {
				if (err){
					console.warn(err.message);  // returns error if no matching object found
				}else{
					arr = [quiz.value.CA, quiz.value.WA1, quiz.value.WA2, quiz.value.WA3];
					quizQuestion = quiz.value.question;
					correctAnswer = quiz.value. CA;
					bot.beginDialog(savedAddress, '*:askQuestion');
				}
			});
		
	}
).triggerAction({matches: /^askquiz$/i});

bot.dialog('askagain', 
    function (session) {
		console.log(session.message.text);
		session.send('OK, I will as the same question again');
		bot.beginDialog(savedAddress, '*:askQuestion');
	}
).triggerAction({matches: /^askagain$/i});

bot.dialog('createQuizQuestion', [
    function (session) {
        builder.Prompts.text(session, "What is the quiz question?");
    },
    function (session, results) {
		session.userData.quizQuestion = results.response;
		builder.Prompts.text(session, "What is the correct answer?");
    },
	function (session, results) {
		session.userData.CA = results.response;
		builder.Prompts.text(session, "Please give a wrong answer");
    },
	function (session, results) {
		session.userData.WA1 = results.response;
		builder.Prompts.text(session, "Please give another wrong answer");
    },
	function (session, results) {
		session.userData.WA2 = results.response;
		builder.Prompts.text(session, "Please give the last wrong answer");
    },
	function (session, results) {
		session.userData.WA3 = results.response;
		db.collection('quizquestion').insertOne({userId: session.message.address.user.id, 
			userName: session.message.address.user.name,
			nickname: session.userData.nickname,
			date:(new Date()).getTime(),
			lastAsked: (new Date()).getTime(),
			question: session.userData.quizQuestion,
			CA: session.userData.CA,
			WA1: session.userData.WA1,
			WA2: session.userData.WA2,
			WA3: session.userData.WA3
			})
			
		// temp solution to fill global vars as session storage doesnt seem to carry over the savedAddress
		arr = [session.userData.CA, session.userData.WA1, session.userData.WA2, session.userData.WA3];
		quizQuestion = session.userData.quizQuestion;
		correctAnswer = session.userData.CA;
		session.beginDialog('askQuestion');
		bot.beginDialog(savedAddress, '*:askQuestion');
    },
])

// quiz in group
// root dialog
bot.dialog('askQuestion', [
	function(session) {
		//var arr = [session.userData.CA, session.userData.WA1, session.userData.WA2, session.userData.WA3];
		arr = shuffle(arr);
		builder.Prompts.choice(session, quizQuestion, arr, { listStyle: 3 });
	},
	function (session, results) {
		//session.userData.WA2 = results.response;
		if (correctAnswer == results.response.entity) {
			var msg = 'That was the correct answer, your score is: ';
			var points = 1;
		} else {
			var msg = 'Sorry that answer was not correct, your score is: ';
			var points = 0;
		}
		
		// find previous score and update
		db.collection('user').findAndModify(
			{userId: session.message.user.id}, // query
			{},  // sort order
			{$inc: {score: points, tries: +1}},
			{},
			function(err, object) {
				if (err){
					console.warn(err.message);  // returns error if no matching object found
				}else{
					session.send(msg + (object.value.score+points));
				}
		});

		session.endDialog();
    },
]);

//ask nickname
bot.dialog('setnick', [
    function (session) {
		var msg = 'Hello nice to meet you. What is your nickname?';
		if (session.userData.nickname) msg = 'Ok lets change your nickname. What is your new nickname?';
		builder.Prompts.text(session, msg);
	},
	function (session, results) {
		db.collection('user').update({
		userId:  session.message.address.user.id},  
		{ $set:{userId: session.message.address.user.id,
		nickname: results.response }
		}, 
		{ upsert: true });
		session.endDialog('Ok from now on I will call you '+results.response+'. if you want to change it you can always say: setnick');
	}
]).triggerAction({matches: /^setnick$/i});

// root dialog
bot.dialog('/', function(session, args) {
	// check if this person already has a nickname
	console.log(session.userData.nickname);
	if (!session.userData.nickname) {
		db.collection('user').findOne({userId: session.message.user.id}, function(err, user) {
			if (err) console.log(err)
			console.log(user);
		console.log(session.message.user.id);
			if (user)
				session.userData.nickname = user.nickname;
			else
				session.beginDialog('setnick');
		})
	}

  savedAddress = session.message.address;
  //console.log('Init:'+savedAddress);

  //var message = 'Hello! I can help you create quiz questions in a group\n\n Usage:\n- startquiz: to create a new quiz question';
  //session.send(message);
});

function shuffle(array) {
  var currentIndex = array.length, temporaryValue, randomIndex;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
}