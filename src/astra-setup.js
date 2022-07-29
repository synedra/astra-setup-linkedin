#!/usr/bin/env node
const astraCollections = require('@astrajs/collections');
const astraRest = require('@astrajs/rest');
const chalk = require('chalk');
const prompts = require('prompts');
const os = require('os');
const fs = require('fs');
const readline = require('readline');
const axios = require('axios');
const dotenv = require('parsenv');
const jq = require('node-jq');
const ConfigParser = require('configparser')
const request = require("request")
const unzipper = require("unzipper")
const https = require("https")
const fstream = require("fstream")

let response = '';
const argv_database = process.argv[2] ? process.argv[2] : ''
const argv_keyspace = process.argv[2] ? process.argv[3] : ''

const envpath = '.env'
if (!fs.existsSync(envpath)) {
	fs.closeSync(fs.openSync(envpath, 'w'));
}

const config = {
    path: envpath
};

const astrapath = os.homedir() + '/.astrarc'
const astraconfig = new ConfigParser
const astra_section = process.env.ASTRA_RC_SECTION ? process.env.ASTRA_RC_SECTION : 'default'
    
if (!fs.existsSync(astrapath)) {
	fs.closeSync(fs.openSync(astrapath, 'w'));
} else {
	astraconfig.read(astrapath)
}

if (astraconfig.sections().indexOf(astra_section) == -1) {
	astraconfig.addSection(astra_section)
}

dotenv.config(config)

class astraClient {
	constructor(ASTRA_DB_ADMIN_TOKEN) {
		this.token = ASTRA_DB_ADMIN_TOKEN;
	}

	async createClient() {
		this.client = await astraRest.createClient({
				applicationToken: this.token,
				baseUrl: 'https://api.astra.datastax.com',
			});

		try {
			await this.checkAuth();
		} catch(e) {
			fs.unlinkSync('.env')
			throw e
		}
	
	};

	async getBundle(databaseId) {
			let path = '/v2/databases/' + databaseId + '/secureBundleURL'
			response = await this.client.post(path);
			let downloadURL = response.data.downloadURL;
			
			var output = os.homedir() + '/.cassandra/' + "bootstrap.zip";
				try {
					if (fs.existsSync(os.homedir() + '/.cassandra/')) {
				 	 //directory exists, all good
					} else {
						fs.mkdir(os.homedir() + '/.cassandra', (err) => {
							if (err) {
								return console.error("Creating dir: " + err);
							}
							console.log('.cassandra Directory created successfully!');
						});
					}
				} catch(e) {
					throw e
				}

				const axios = require('axios');
				delete axios.defaults.headers.common['Authorization'];

				await this.getZip(downloadURL)
				await fs.createReadStream(os.homedir() + '/.cassandra/bootstrap.zip')
					.pipe(unzipper.Extract({ path: os.homedir() + '/.cassandra/'}))
					.promise()

				
			}
			
	async getZip(downloadURL) {
		return new Promise((resolve) => {
			https.get(downloadURL, response => {
				response.on('data', function(data) {
						fs.appendFileSync(os.homedir() + '/.cassandra/bootstrap.zip', data);
					});
					response.on('end', () => {
	
				   resolve();
				})
			})})
	}

	async checkAuth() {
		this.keyspaces = [];
		try {
			response = await this.client.get('/v2/databases/');
		} catch (e) {
			console.log(e)
			throw new Error("Invalid token")
		}
	}

	// First, check for a database
	async setUpDatabase(astra_database = 'default', astra_keyspace = 'default') {
		// The first thing we want to do is get a list of databases
		console.log(chalk.yellow('Checking for existing ' + astra_database + ' database.'));

		await this.findDatabasebyName(astra_database, false);
		if (this.db != null && this.db.status != 'ACTIVE') {
			console.log('Waiting for DB ACTIVE status here');
			let active = await this.findDatabasebyID(this.db.id, true);
		}
		if (this.db == null) {
			let create = await this.createDB(astra_database, astra_keyspace);
			await this.findDatabasebyName(astra_database, true);
		}

		dbID = this.db.value;
		setEnv("ASTRA_DB_ID", this.db.value );
		setEnv("ASTRA_DB_REGION", this.db.region);
		setEnv("ASTRA_DB_KEYSPACE", astra_keyspace );

		// Check for the keyspace
		console.log(chalk.green('Checking for keyspace ' + astra_keyspace));
		await this.findKeyspaces(this.db.value);
		let keyspace_found = 0;
		this.keyspaces.forEach(async (keyspace) => {
			if (keyspace.value == astra_keyspace) {
				console.log(chalk.green('    keyspace ' + astra_keyspace + ' found'));
				keyspace_found = 1;
				setEnv("ASTRA_DB_KEYSPACE", astra_keyspace );
			}
			if (keyspace_found != 1) {
				console.log('    creating new ' + astra_keyspace + ' keyspace');
				await client.createNewKeyspace(client.db.value, astra_keyspace);
				setEnv("ASTRA_DB_KEYSPACE", astra_keyspace );
			}
		});
		console.log("Setting up secure bundle")
		await client.getBundle(this.db.id)
	}

	async findDatabases() {
		axios.defaults.headers.common['Authorization'] = 'Bearer ' + process.env.ASTRA_DB_ADMIN_TOKEN;
		this.database_list = [];
		response = await this.client.get('/v2/databases');
		let parseoutput = await jq.run(
			'[.data[] | {id: .id, name: .info.name, status: .status, region: .info.region, keyspace: .info.keyspaces, status: .status}] | unique',
			response,
			{
				input: 'json',
			}
		);
		JSON.parse(parseoutput).forEach((database) => {
			this.database_list.push({
				value: database.id,
				title: database.name,
				status: database.status,
				region: database.region,
				keyspace: database.keyspace,
				id: database.id,
			});
		});
	}

	async getNewAuthToken() {
		axios.defaults.headers.common['Authorization'] = 'Bearer ' + process.env.ASTRA_DB_ADMIN_TOKEN;
		let payload = {"roles":["1faa93f2-b889-4190-9585-4bc6e3c3595a"]}
		response = await this.client.post('/v2/clientIdSecrets', payload);
		setEnv("ASTRA_DB_CLIENT_ID", response.data.clientId );
		setEnv("ASTRA_DB_CLIENT_SECRET", response.data.secret );

	}

	async requestWithRetry(url) {
		const MAX_RETRIES = 20;
		for (let i = 1; i <= MAX_RETRIES; i++) {
			let response = await this.client.get(url);
			console.log(chalk.yellow('         ... status is ' + response.data.status));
			if (response && response.data.status == 'ACTIVE') {
				
				return response;
			} else {
				const timeout = 5000 * i * 10;
				console.log(chalk.blue('         ... waiting', timeout, 'ms'));
				await wait(timeout);
			}
		}
		let dbActive = await this.requestWithRetry('/v2/databases/' + this.db.id);
		console.log(chalk.yellow('     Database is now ACTIVE'));
		return dbActive;
	}

	async findDatabasebyID(dbID, retry) {
		console.log(chalk.yellow('Looking for ' + dbID));
		this.db = null;
		let complete = null;
		await this.findDatabases();

		this.database_list.forEach((database) => {
			if (!complete && !this.db) {
				if (database.id == dbID && database.status != 'TERMINATING') {
					this.db = database;
					this.database_list = [];
					console.log(chalk.yellow('     ' + database.title + ': Current status is ' + database.status));
				}
				if (this.db && this.db.status == 'ACTIVE' && complete == null) {
					complete = 1;
					return this.db;
				}
			}
		});
		if (this.db && retry) {
			let dbActive = await this.requestWithRetry('/v2/databases/' + this.db.id);
			return this.db;
		}
		return null;
	}

	async findDatabasebyName(astra_database, retry) {
		console.log(chalk.yellow('Looking for ' + astra_database));
		this.db = null;
		let complete = null;
		await this.findDatabases();

		this.database_list.forEach((database) => {
			if (!complete && !this.db) {
				if (database.title == astra_database && database.status != 'TERMINATING') {
					this.database_list = [];
					this.db = database;
					setEnv("ASTRA_DB_ID", this.db.value );
					setEnv("ASTRA_DB_REGION", this.db.region);

					console.log(chalk.yellow('     ' + astra_database + ': Current status is ' + database.status));
				}
				if (this.db && this.db.status == 'ACTIVE' && complete == null) {
					complete = 1;
					return this.db;
				}
			}
		});
		if (this.db && retry) {
			let dbActive = await this.requestWithRetry('/v2/databases/' + this.db.id);
			return this.db;
		}
		return null;
	}



	async createDB(astra_database, astra_keyspace) {
		console.log(chalk.green('Creating new database ' + astra_database));

		try {
			response = await this.client.post('/v2/databases', {
				name: astra_database,
				keyspace: astra_keyspace,
				cloudProvider: 'GCP',
				tier: 'serverless',
				capacityUnits: 1,
				region: 'us-east1',
			});
		} catch (e) {
			console.log('ERROR:' + e);
		}
	}

	async findKeyspaces(db) {
		this.keyspaces = [];
		response = await this.client.get('/v2/databases/' + db);

		response.data.info.keyspaces.forEach((keyspace) => {
			this.keyspaces.push({ value: keyspace, title: keyspace });
		});
		
		return this.keyspaces
	}

	async createNewKeyspace(db, astra_keyspace) {
		console.log(chalk.yellow('     Creating new ' + astra_keyspace + ' keyspace'));
		response = await this.client.post('/v2/databases/' + db + '/keyspaces/' + astra_keyspace);
		console.log(chalk.yellow('     ...created'));
		setEnv("ASTRA_DB_KEYSPACE", astra_keyspace );

	}
}

function wait(timeout) {
	return new Promise((resolve) => {
		setTimeout(() => {
			resolve();
		}, timeout);
	});
}

async function getTokens() {
	let data = {};
		console.log('Login to Astra at https://dstx.io/workshops');
		console.log('After login, you can create a database.');
		console.log('Click on your name in the left-hand column');
		console.log('In the dropdown, select "Organization Settings"');
		console.log('    Select "Token Management" from the left-hand column');
		console.log('    Select "Database Administrator" in the Role dropdown');
		console.log('    Click "Generate Token"');
		console.log('    Save to CSV if you want to access it later');

        const questions = [	
        { type: 'text', name: 'dbid', message: 'Please paste the Database ID here \n'},
        { type: 'text', name: 'secret', message: 'Please paste the Client Secret here\n'}, 
        { type: 'text', name: 'token', message: 'Please paste the Database Admin Token (Token) here\n'}, 
        ];
        const response = await prompts(questions);
        console.log(response);

        let admin_token = response.token.replace(/"/g, '');
        setEnv("ASTRA_DB_ADMIN_TOKEN",  admin_token);
        setEnv("ASTRA_DB_APPLICATION_TOKEN",  admin_token);

        let dbid = response.dbid.replace(/"/g, '');
        setEnv("ASTRA_DB_CLIENT_ID",  dbid);

        let secret = response.secret.replace(/"/g, '');
        setEnv("ASTRA_DB_CLIENT_SECRET",  secret);


	return dotenv;
}

let dbID = '';

start();

async function start() {
	console.log(chalk.yellow('Checking your credentials...\n'));

	let creds = await getTokens();
	if (!creds) {
		console.log(chalk.red('Need to set up authentication stuff'));
		process.exit(0);
	}
	axios.defaults.headers.common['Authorization'] = 'Bearer ' + process.env.ASTRA_DB_ADMIN_TOKEN;
	client = new astraClient(process.env.ASTRA_DB_ADMIN_TOKEN);
	try {
		await client.createClient();
	}catch {
		console.log(chalk.red('Invalid token'));
		process.exit(0);
	}

	let newToken = await client.getNewAuthToken();

	console.log(chalk.yellow('Credentials set up, checking database'));
	if (argv_database != '' && argv_keyspace != '') {
		let existing = await client.findDatabasebyName(argv_database, true);
		if (!existing ) {
			await client.createDB(argv_database, argv_keyspace);
			await client.findDatabasebyName(argv_database, true);
			setEnv("ASTRA_DB_KEYSPACE", argv_keyspace );
			console.log(chalk.yellow("Setting up secure bundle"))
			await client.getBundle(client.db.id)
			
		} else { 
			console.log (chalk.yellow('    existing ' + argv_database + ' database found.'))
			let keyspaces = await client.findKeyspaces(existing.id);
			let found = 0
			console.log(chalk.yellow('Looking for ' + argv_keyspace + " keyspace"));
		
			keyspaces.forEach(keyspace => {
				if (keyspace.value == argv_keyspace) {
					found = 1
					setEnv("ASTRA_DB_KEYSPACE", argv_keyspace );
				}
			})
			if (found == 1) {
				console.log(chalk.yellow("    keyspace " +argv_keyspace + " already exists"))
			} else {
				await client.createNewKeyspace(existing.id, argv_keyspace)	
				console.log(chalk.yellow("    keyspace " + argv_keyspace + " created"))			
			}
			
			setEnv("ASTRA_DB_ID", client.db.value );
			setEnv("ASTRA_DB_REGION", client.db.region);
			setEnv("ASTRA_DB_KEYSPACE", argv_keyspace );
			setEnv("ASTRA_GRAPHQL_ENDPOINT", "https://" + client.db.value + "-" + client.db.region + ".apps.astra.datastax.com/api/graphql/" + client.db.keyspace)
			console.log(chalk.yellow("Setting up secure bundle"))
			await client.getBundle(client.db.value)
		}
		
		
		return;
	}
	let onSubmit = (prompt, answer) => console.log(`Thanks, moving forward with: ${answer}`);
	let questions = [
		{
			type: 'select',
			name: 'options',
			message: 'Do you want to use an existing database, or create a new one?',
			hint: false,
			choices: [
				{
					description: "Use the default ('astra database, stargate keyspace')",
					title: 'default',
					name: 'Default',
				},
				{ description: 'Create my own database and keyspace', title: 'create' },
				{ description: 'Select from my existing databases', title: 'select' },
			],
		},
	];

	let options = await prompts(questions);

	switch (options.options) {
		case 0:
			await client.setUpDatabase('astra', 'stargate');
			break;
		case 1:
			questions = [
				{ type: 'text', name: 'database', message: 'Please enter your database name here: ' },
				{ type: 'text', name: 'keyspace', message: 'Please enter your keyspace name here: ' },
			];
			answers = await prompts(questions);
			await client.createDB(answers.database, answers.keyspace);
			db = await client.findDatabasebyName(answers.database, true);
			setEnv("ASTRA_DB_ID", client.db.value );
			setEnv("ASTRA_DB_REGION", client.db.region);
			setEnv("ASTRA_DB_KEYSPACE", answers.keyspace );
			break;
		case 2:
			await client.findDatabases();
			let dbList = client.database_list;
			let choices = [];
			let dbs = {};
			dbList.forEach((element) => {
				choices.push(element);
				dbs[element.value] = element;
			});
			questions = [
				{
					type: 'select',
					name: 'database',
					message: 'Please choose the database you wish to use',
					hint: false,
					choices: choices,
				},
			];
			database = await prompts(questions);
			await client.findDatabasebyID(dbs[database.database].value);
			if (client.db == null) {
				console.log("Didn't find " + dbs[database.database].value);
				await client.createDB(dbs[database.database].title);
				await client.findDatabasebyName(dbs[database.database].title, true);
			}
			db = client.db;

			if (db.status != 'ACTIVE' && db.status != 'TERMINATING') {
				db = await client.findDatabasebyID(db.id, true);
			}
			console.log(chalk.yellow('Database ready: ' + db.title));
			choices = [{ title: 'Create new keyspace', value: 'Create new keyspace' }];
			await client.findKeyspaces(db.value);
			client.keyspaces.forEach((element) => {
				choices.push(element);
			});
			questions = [
				{
					type: 'select',
					name: 'keyspace',
					message: 'Please choose the keyspace you wish to use',
					hint: false,
					choices: choices,
				},
			];
			let keyspace = await prompts(questions);

			if (keyspace.keyspace == 'Create new keyspace') {
				const questions = [{ type: 'text', name: 'keyspace', message: 'Please enter your keyspace here: ' }];
				keyspace = await prompts(questions);
				await client.createNewKeyspace(db.id, keyspace.keyspace);
			}
			console.log(chalk.yellow('Using Keyspace: ' + keyspace.keyspace));

			await client.findDatabasebyName(client.db.title, true);
			if (client.db == null) {
				await client.createDB(client.db.title, keyspace.keyspace);
				await client.findDatabasebyName(client.db.title, true);
			}
			setEnv("ASTRA_DB_KEYSPACE", keyspace.keyspace );

			
			break;
	}
	console.log(chalk.yellow("Setting up secure bundle"))
	await client.getBundle(client.db.id)

	process.exit();
			
	
}

async function setEnv(variable, value) {
	dotenv.edit({ [variable]: value });
	astraconfig.set(astra_section,variable, value)
	process.env[variable] = value
	dotenv.write(config);
	dotenv.config(config);
	astraconfig.write(astrapath)
	return dotenv;		
}
