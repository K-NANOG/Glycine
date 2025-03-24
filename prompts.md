So I've already started to build a dynamically reconfigurable web crawler programthat is optimised for research called Glycine. The main intention behind this program is that:
1. I'm tired to have to do bibliographical work myself, there is so much papers being published everyday that I can't go through all of them and a no scientist can have the time to do it. So everybody lacks a broad vision of everything that is happening and everything that has happened.

2. I have to go fetch the relevant information according to what I think is appropriated at the time, not my general research interests. I would want the system to directly know my research interest and to bring the data to me directly.

3. I have to find the research gaps by myself instead of having the papers that are the most relevant being preprocessed and the research gaps suggested to me.

4. There is no centralisations of the plateforms I would like to integrate (google scholar, pubmed, rss feeds, igem projects, github projects) So each transition between different tools create an additional layer of friction which I would like to alleviate with glycine.

5. The interface of scientific research pleteforms is not intuitive, beautiful or enjoyable, I want to be aesthetically pleased when going through research. This is why I built this interface with my esthetical preference in mind, using a glass morphic style and minimalist style, and building the whole web app using Next.js.

6. The most up to date tools aren't linked properly together, a scientist must go through several tools to learn about new papers and write a simple draft. Also, projects, whether they be biotech projects in iGEM or computer science projects or tools that may be useful to a given article, aren't centralized or properly indexed.

That said I want to:
1. Automate the acquisition of papers even in specific niche fields parametrised as a config file containing research tags corresponding to my interests.

2. Automate the discovery of research gaps or low hanging fruits through nlp ai agents or directed acyclic graphs Or more type of complex hypergraphs Or a matrix factorization.

3. Have different crawling programs that dynamically evolves such that it is always relevant, either through dynamic parameters or polymorphic code.

4. Get the best github tools for any application as they are usually badly indexed

5. Have a system that can automatically generate a latex or markdown editor session with the outline of the article structure in the typical style of journal articles of the field or in a general latex style.


6. The paper abstracts are then interpreted and compared to one another to suggest improvement, because one of the reasons why some research never happens is just because of its availability, humans don't store a lot of articles in working or long term memory so they miss potentially great interdisciplinary or intradisciplinary connexions.

7. Eventually once a research gap is validated by the user a simple latex or markdown editor session should be loaded with the outline of the article structure.

The presets should include the most precise tags possible (user defined) and each tag should be assigned a random and unique color (all in the elegant minimalist glassmorphism style of the website).
For the RSS feeds the program should be able to extract relevant tags informations even from not so specific rss feeds.
Glycine aims to be tentacular and holistic in scope, each new tool must be integrated and assimilated, it's an example of intention level h where the tools and programs are secondary, glycine assimilates every program relevant to its goal.

So in the current state of the project, I successfully built the whole architecture with a crawler factory that creates implementations of crawlers with the first crawler that crawls PubMed successfully. Now I think the first goal is to create additional crawlers and to try them one by one so with the other sources that I mentioned. The first task I want you to do is to suggest potentially other crawling sources that I might not have identified.