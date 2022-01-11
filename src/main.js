const Apify = require('apify')
const { log, sleep } = Apify.utils;
log.setLevel(log.LEVELS.DEBUG)

function extractData(request, $) {

    const typeValues = $('.vitals-table tbody th:contains("Type")')
        .next('td')
        .find('a')
        .map((_, monType) => $(monType).text())
        .get()
        .filter((s) => s);

    return {
        url: request.url,
        dexNumber: $('.vitals-table tbody th:contains("National")')
            .next('td')
            .find('strong')
            .text(),
        name: $('.main-content h1')
            .first()
            .text(),
        img: $('.tabset-basics .sv-tabs-panel-list .grid-row .text-center')
            .children('p')
            .first()
            .find('a[href]')
            .attr('href'),
        types: typeValues
    }
}

Apify.main(async () => {
    const input = await Apify.getInput();
    console.log('INPUT: ');
    console.log(input);

    const requestList = await Apify.openRequestList('start-urls', [
        {
            url: 'https://pokemondb.net/pokedex/national',
            userData: {
                label: 'list'
            },
        },
    ]);

    const requestQueue = await Apify.openRequestQueue();
    const proxyConfiguration = await Apify.createProxyConfiguration({ ...input.proxyConfiguration })

    const crawler = new Apify.CheerioCrawler({
        requestList,
        requestQueue,
        proxyConfiguration,

        handleRequestTimeoutSecs: 120,
        requestTimeoutSecs: 120,
        handlePageTimeoutSecs: 240,

        handlePageFunction: async ({ request, $ }) => {
            log.info(`Open url ${request.url}`)
            await sleep(1000);

            const { userData } = request;

            if (userData.label === 'list'){

                log.info('Fetching List Items')

                const pokemonLinks = $('.infocard-list .infocard .infocard-lg-img a[href]')
                    .map((_, link) => $(link).attr('href'))
                    .get()
                    .filter((s) => s);

                if (pokemonLinks.length === 0) {
                    log.info(`No Items Found`)
                    return;
                }

                log.info(`Fetched ${pokemonLinks.length} items`)

                let queuedLinks = 0;

                for (const link of pokemonLinks) {
                    const url = link.startsWith('https://') ? link : `https://pokemondb.net${link}`;

                    const rq = await requestQueue.addRequest({
                        url, userData: {
                            ...userData, label: 'item',
                        },
                    });

                    if (!rq.wasAlreadyPresent){
                        queuedLinks++
                    }
                }

                if (queuedLinks){
                    log.info(`Added ${queuedLinks} pokemon`)
                }

            }else if (userData.label === 'item') {
                const pokemonResult = extractData(request, $);
                let userResult = {};

                await Apify.pushData({...pokemonResult, ...userResult})
            }
        },

        handleFailedRequestFunction: async ({ request }) => {
            await Apify.pushData({
                '#isFailed': true,
                '#debug': Apify.utils.createRequestDebugInfo(request),
            });
        },
    });

    await crawler.run();

    log.info('Done');
})
