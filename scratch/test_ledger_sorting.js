// scratch/test_ledger_sorting.js

function testSorting() {
    const order = {
        'OP BAL': 0,
        'SALES': 1,
        'STOCK_PURCHASE': 1,
        'STOCK_SALE': 1,
        'INDIRECT_PURCHASE': 1,
        'INDIRECT_SALES': 1,
        'RECEIPT': 1,
        'PAYMENT': 1,
        'BY CASH RECEIPT': 2,
        'BY BANK RECEIPT': 3,
        'DISCOUNT': 4
    };

    const getGroupId = (id) => {
        const strId = String(id);
        if (strId.startsWith('stock_')) return strId.split('_')[1];
        if (strId.startsWith('sale_')) return strId.split('_')[1];
        if (strId.startsWith('payment_')) return strId.split('_')[1];
        if (strId.startsWith('voucher_')) return strId.split('_')[1];
        return strId;
    };

    const sortingFunction = (a, b) => {
        if (a._id === 'opening_balance') return -1;
        if (b._id === 'opening_balance') return 1;

        // Sort by calendar date first (ignoring time)
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);

        const dateOnlyA = new Date(dateA.getFullYear(), dateA.getMonth(), dateA.getDate()).getTime();
        const dateOnlyB = new Date(dateB.getFullYear(), dateB.getMonth(), dateB.getDate()).getTime();

        if (dateOnlyA !== dateOnlyB) {
            return dateOnlyA - dateOnlyB;
        }

        // If same calendar date, sort by data entry time (createdAt)
        const createdAtA = new Date(a.createdAt || a.date).getTime();
        const createdAtB = new Date(b.createdAt || b.date).getTime();
        if (createdAtA !== createdAtB) {
            return createdAtA - createdAtB;
        }

        const groupA = getGroupId(a._id);
        const groupB = getGroupId(b._id);

        if (groupA !== groupB) {
            return groupA.localeCompare(groupB);
        }

        const orderA = order[a.particulars] || 99;
        const orderB = order[b.particulars] || 99;
        if (orderA !== orderB) {
            return orderA - orderB;
        }

        return String(a._id).localeCompare(String(b._id));
    };

    // Test input data:
    // We have a Trip Sale added first on Jun 8 at 10:00 AM (timestamp)
    // We have an Indirect Sale added last on Jun 8 at 4:00 PM (createdAt), but its business date is midnight
    const inputEntries = [
        {
            _id: 'sale_trip123_SALES',
            date: new Date('2026-06-08T10:00:00.000Z'),
            createdAt: new Date('2026-06-08T10:00:00.000Z'),
            particulars: 'SALES'
        },
        {
            _id: 'indirect456',
            date: new Date('2026-06-08T00:00:00.000Z'), // midnight
            createdAt: new Date('2026-06-08T16:00:00.000Z'), // added last
            particulars: 'INDIRECT_SALES'
        }
    ];

    console.log('Original entries order:');
    inputEntries.forEach((e, i) => console.log(`${i + 1}. Particulars: ${e.particulars}, Date: ${e.date.toISOString()}, CreatedAt: ${e.createdAt.toISOString()}`));

    const sorted = [...inputEntries].sort(sortingFunction);

    console.log('\nSorted entries order (Expected: Trip SALES first, then INDIRECT_SALES):');
    sorted.forEach((e, i) => console.log(`${i + 1}. Particulars: ${e.particulars}, Date: ${e.date.toISOString()}, CreatedAt: ${e.createdAt.toISOString()}`));

    if (sorted[0]._id === 'sale_trip123_SALES' && sorted[1]._id === 'indirect456') {
        console.log('\nPASS: Sorting behaves correctly under tie-breaker.');
    } else {
        console.error('\nFAIL: Sorting is incorrect!');
    }
}

testSorting();
