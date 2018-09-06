const path = require('path');
const Scraper = require(path.join(__dirname,'scraper.js'));
let scraper = new Scraper({});

scraper.on('metrics.set', (obj)=>{
	const { musicbrainz } = obj;
	switch (true){
		case musicbrainz && typeof musicbrainz.page_count !== 'undefined':
			scraper.run({
				musicbrainz:{
					page_count: musicbrainz.page_count 
				}
			});
			break;
		default:
	}
});

scraper.on('metrics.refresh',metrics=>{
	//console.log(metrics);
});
