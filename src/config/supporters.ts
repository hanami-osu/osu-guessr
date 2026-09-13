interface Supporter {
    name: string;
    url?: string;
    amount: number;
    message?: string;
}

export const supporters: Array<Supporter> = [
    { name: "neriv", url: "https://osuguessr.com/user/12643934", amount: 5, message: "enjoy ur coffee bro" },
    {
        name: "Eric",
        url: "https://osuguessr.com/user/4573558",
        amount: 5,
        message: `yoru - Yesterday at 5:41 am
    osu!guessr`,
    },
    {
        name: "-spliffy",
        url: "https://osuguessr.com/user/20973665",
        amount: 15,
        message: `stay silly PagBounce`,
    },
    {
        name: "Timur Vorobev",
        url: "https://google.com",
        amount: 11,
        message: `very nice`,
    },
];
