/**
 * @file app.js
 * @author Роман Галкин
 * @brief Основной файл кода страницы
 */
var XHRCache={}; // Хранилище для активного XHR запроса и ссылки на него
/**
 * Callback функция, вызываемая при истечении времени выполнения XHR запроса.
 * @param {ProgressEvent} Событие, вызываемое браузером.
 */
var timeoutfunc = function(e){
	if(e.srcElement!==undefined && e.srcElement.url!==undefined) // Е такие поля есть в ProgressEvent'е
	   delete XHRCache[e.srcElement.url]; // Убираем запрос из кэша, чтобы можно было повторно его вызвать
}
/**
 * Асинхронно запрашивает страницу API, формируя и отправляя запрос, проверяя на ошибки и возвращая результат в функцию-callback.
 * @param {String} url Ссылка на страницу API.
 * @param {Function} func Функция, отвечающая за обработку запроса.
 * @return {Boolean} Статус запроса, успешен или нет.
 */
function APIData(url,func){
	if(XHRCache[url]!==undefined) // Если запрос уже есть, то не надо его повторять
		return false;
	if(url.substring(0,4)==="http" && url[4]!=='s') // SWAPI принимает запросы только по порту 443 (с SSL), но в ответах API возвращает HTTP ссылки, т.е. порт 80
		url="https"+url.substring(4); // Поэтому заменим протокол на правильный, чтобы избежать лишних редиректов со стороны сайта swapi.dev
	var xhr = new XMLHttpRequest(); // Для поддержки старых браузеров (IE9+) вместо fetch
	xhr.open('GET',url,true); // Инициализируем метод, ссылку и указываем на асинхронность
	xhr.onreadystatechange=function(){ // Создаём обработчик события получения пакета от сервера
		if (xhr.readyState !== 4) return; // Если это промежуточный пакет, игнорируем, пока не будет загружено целиком
		if (xhr.status === 200){ // Если статус успешный (200=OK)
			try{func(JSON.parse(xhr.responseText));} // Пытаемся преобразовать строку в JSON
			catch(e){func(false)}; // Иначе возвращаем ложь
		}
		delete XHRCache[url]; // Если запрос выполнен, то убираем его из списка активных запросов
	}
	xhr.url = url; // Для callback функции
	xhr.timeout = 5000; // Устанавливаем максимальное время ожидания равное 5 секундам = 5000 мс
	xhr.addEventListener("timeout", timeoutfunc); // Устанавливаем функцию, вызывающуюся при окончании времени ожидания
	xhr.send(); // Отправляем запрос по ссылке
	XHRCache[url]=xhr; // Добавляем запрос в список активных
	return true;
}
var ProcessLoad=function(json,m){
	if(m[0]!==undefined) // Если не удалено сборщиком мусора
		Vue.set(m[0],m[1],json); // Реактивно устанавливаем его значение для рендера
	// Конечно, такой способ не из лучших, но он работает и потребляет совсем немного, к тому же, это выполняется лишь один раз для каждого нового объекта
}
Vue.use({install:function(Vue,o){Vue.prototype.$t=lang;}}); // Добавляем как плагин текущую локализацию, чтобы не делать её реактивной
window.addEventListener("load",function(){ // Неправильно добавлять тег <script> в body, он должен быть в <head>. Но из-за этого <body> прогружается позже, поэтому необходимо отловить момент, когда загрузка будет завершена
	var Cache={};// Нет необходимости делать параметры каждого объекта реактивными, поэтому воспользуемся кэшированием результата. В последствии, это поможет избежать повторных запросов к API
	var Types={}; // Вспомогательная таблица с типами для указания ID'ов объектов меню
	var Main = new Vue({ // Создаём локальную функцию для дальнейшего вызова, а также объект Vue
		el: '#main', // Указываем селектором на id = main
		data: {items: [], select: {}, selected: false}, // Добавляем реактивность для items, select и selected
		mounted: function(){ // Добавляем функцию для запуска после активации реактивности элемента
			var self=this; // Т.к. this изменится, заранее делаем его локальной переменной
			APIData("https://swapi.dev/api/",function(json){ // Запрашиваем главную страницу API
				if(json) // Если запрос успешен и JSON декодируется
					for (var btn in json){ // Итерируем по результату
						Types[btn]=self.items.length; // Добавляем запись для быстрого определения ключа без итерации
						self.items.push({id:btn, part:self.$t[btn]!==undefined ? self.$t[btn] : btn,url:json[btn],expanded:false}); // Добавляем категории, указывая ссылку, наименование и статус видимости подкатегорий
					}
			});
			this.forcePage(); // Если есть параметры в ссылке, то выведем результат по ним
		},
		methods: {
			/**
			 * Функция on-click для кнопки разворота категории на подкатегории.
			 * @param {Number} id ID в списке элементов категории.
			 * @param {String} url Ссылка на страницу данных категории.
			 * @param {Boolean} main Является ли вызов от главной кнопки категории.
			 * @param {Array} cb Список из Функции, которая вызывается после получения сведений о категории, и аргументов к ней.
			 */
			expand: function(id,url,main,cb){
				id=Types[id];
				var item=this.items[id]; // Локальная переменная для уменьшения вычислительной сложности при повторяющемся доступу к элементу по индексу
				if(main){ // Если нажатие кнопки категории
					if(item.expand){ // Если уже есть элементы в этой категории, то повторно запрашивать их не надо
						item.expanded=!item.expanded; // Скрываем или открываем категорию
						return;
					}
				}
				var self=this;
				APIData(url,function(json){
					if(json){
						item.count=json.count; // Информационные поля, реактивность не нужна. Отвечает за количество элементов в API
						item.nexturl=json.next; // Отвечает за следующую страницу элементов из API
						item.prevurl=json.previous; // Отвечает за предыдущю страницу
						if(item.expand){ // Если подгруппы уже есть, то добавляем новые к общему массиву
							for(var rid in json.results){ // Итерируем по массиву результатов, чтобы не использовать concat и не создавать результирующую таблицу
								var res=json.results[rid]; // Чтобы избежать ES6 синтаксиса
								self.cacheElement(res); // Кэшируем элемент для будущего использования
								item.expand.push(res); // Поле уже реактивно, нет смысла устанавливать через сеттер
							}
						}else{
							var rz=[]; // Необходимо закэшировать элементы, поэтому нельзя просто присвоить значению исходный массив
							for(var rid in json.results){
								var res=json.results[rid];
								self.cacheElement(res);
								rz.push(res);
							}
							Vue.set(item,'expand',rz); // Реактивное поле, так как добавляется подмассив для меню, который надо отрендерить
						}
						if(main)
							item.expanded=true; // Если нажатие на категорию и первая загрузка, то раскроем категорию
						if(cb!==undefined) // Если установлена функция
							cb[0](json,cb[1],cb[2]); // Вызываем её, передавая аргументы
					}
				})
			},
			/**
			 * Функция on-click для кнопки подкатегории.
			 * @param {Number} id ID в списке элементов категории.
			 * @param {Number} subid ID в списке элементов подкатегории.
			 * @param {Boolean} nb Не стоит добавлять объект в историю?
			 */
			subview: function(id,subid,nb){
				var item=Cache[id],sub=item[subid],st={}; // Получаем ссылку на предмет, на подкатегорию и создаём массив с переводом
				for(var att in sub){
					if(att==="_id" || att==="_type") // Игнорируем специальные параметры
						continue;
					var val=sub[att]; // Получаем значение, так как оно может измениться
					if(typeof(val)==="string" && att!=="url" && val.substring(0,4)==="http") // Если присутствует одиночная ссылка
						val=[val]; // То представляем ввиде объекта, чтобы её обработало и записало наименование
					if(typeof(val)==="object"){ // Если это массив из ссылок
						var sar=[]; // Создаём промежуточный массив для записи в него вариантов
						for(var subi in val){ // Итерируем по массиву
							var subg=val[subi]; // Находим значение по ключу
							if(subg===undefined)
								break;
							var selem=this.getElement(subg, ProcessLoad, [sar,sar.length]); //Вызываем функцию получения элемента и функцию для замены
							if(selem!==false) // Если элемент есть в кэше
								sar.push(selem);
							else // Иначе просто записываем как ссылку
								sar.push(subg);
						}
						val=sar; // Записываем новый массив (до этого был объект, поэтому это лучше в любом случае)
					}
					if(this.$t[att]!==undefined) // Если можно перевести ключ
						att=this.$t[att]; // То переводим
					st[att]=val; // Иначе оставляем как есть
				}
				this.select=st; // Устанавливаем текущий выбранный массив для рендера
				this.selected=true; // Устанавливаем поле для отображения результата
				if(!nb){
					var curloc=new URLSearchParams(location.search); // Получаем текущие параметры ссылки и сформировываем объект для управления параметрами
					curloc.set('type',id); // Устанавливаем тип в ссылку
					curloc.set('id',subid); // Устанавливаем подкатегорию ссылки
					window.history.pushState({type:id,id:subid}, '', location.pathname+'?'+curloc); // Добавляем в историю браузера переход на другую псевдо-страницу
				}
			},
			/**
			 * Функция для получения информации о ссылке из внутреннего кэша объектов.
			 * @param {String} url Ссылка на API объекта.
			 * @param {Function|Void} func Функция, которая будет вызвана, если объекта нет в кэше.
			 * @param {Array|Void} args Список аргументов к функции.
			 * @return {Object|Boolean} Возвращает найденный объект из кэша или ложь, в случае отсутствия.
			 */
			getElement: function(url,func,args){
				var at=this.infoElement(url); // Парсим информацию из ссылки (id, тип)
				if(Cache[at[0]] && Cache[at[0]][at[1]]) // Если такой объект есть в кэше
					return Cache[at[0]][at[1]]; // То возвращаем его
				this.queueElement(url,func,args); // Иначе добавляем в очередь на получение результата
				return false; // И возвращаем провал
			},
			/**
			 * Функция для получения информации из ссылке о типе и ID'у объекта.
			 * @param {String} url Ссылка на API объекта.
			 * @return {Array} Список, содержащий тип и id объекта.
			 */
			infoElement: function(url){
				var spl=url.split("/"),id=spl.pop(); // Разбиваем ссылку символом "/" и находим ID и тип. Например /people/2/, id=2, type=people
				if(id==="")id=spl.pop(); // Т.к. ссылки могут быть как /people/2, так и /people/2/
				return [spl.pop(),id]; // Возвращаем массив, т.к. возврат ограничен одной переменной
			},
			/**
			 * Функция для кэширования элемента для будущего использования.
			 * @param {Object} el Объект из API для кэширования.
			 */
			cacheElement: function(el){
				var at=this.infoElement(el.url),type=at[0]; // Получаем информацию о ссылке в элементе
				if(Cache[type]===undefined) // Если нет такого типа в кэше
					Cache[type]={}; // Создаём массив для него
				el._type=type; // Устанавливаем тип
				el._id=at[1]; // Устанавливаем уникальный индетификатор
				Cache[type][at[1]]=el; // Записываем в кэш
			},
			/**
			 * Функция для создания запроса по ссылке на объект и последующее кэширование и обработка.
			 * @param {String} url Ссылка на объект API.
			 * @param {Function} func Функция, которая вызывается после загрузки нужной страницы.
			 * @param {Array} arr Список аргументов к функции.
			 */
			queueElement: function(url,func,arr){
				if(func===undefined) // Если вдруг функция не указана
					return;
				var self=this;
				APIData(url,function(json){ // Т.к. запрос ассинхонный, нет смысла создавать конвеер или очередь, просто запрашиваем данные
					if(json){
						self.cacheElement(json); // Если ответ получен, кэшируем как элемент
						func(json,arr); // Вызываем функцию, передавая ответ от API и список аргументов.
					}
				})
			},
			/**
			 * Функция для выбора предмета из API, основываясь на текущей ссылке.
			 * @param {Event} e Событие, генерируемое браузером в момент смены ссылки путём навигации в истории.
			 */
			forcePage: function(e){
				if(e!==undefined) // Если функция вызвана событием от браузера
					e.preventDefault(); // Предотвращаем возможную смену страницы
				var curloc=new URL(document.location); // Формируем из ссылки объект типа URL 
				var search=curloc.searchParams; // Получаем, сформированные в массив, параметры запроса
				var type=search.get("type"),id=search.get("id"); // Получаем параметры type, get из ссылки
				if(type===null || id===null) // Если какой-то из параметров отсутствует, вывести элемент невозможно
					return;
				var elem=this.getElement("https://swapi.dev/api/"+type+"/"+id+"/", this.popState, [type,id]); // Получаем элемент из кэша или добавляем в очередь на скачивание
				if(elem) // Если элемент есть
					this.subview(type,id,true); // Выводим его на экран пользователя, формируя таблицу вывода
			},
			/**
			 * Функция для обработки ответа от API при смене ссылки или при первой её прогрузке.
			 * @param {Object} json JSON-результат от API.
			 * @param {Array} m Список, содержащий тип и ID элемента для отображения из кэша.
			 */
			popState: function(json,m){
				if(json){
					this.subview(m[0],m[1],true);
				}
			},
			/**
			 * Собирает статистику со страниц категории.
			 */
			loadStatistics: function(){
				var st={}; // Массив для хранения информации для вывода
				for(var ind in this.items){ // Итерируем по категориям
					var val=this.items[ind];
					if(val.count) // Если категория уже загружена
						st[val.part]=val.count; // Устанавливаем количество элементов и выводим пользователю за счёт реактивности
					else{
						st[val.part]='?'; // Иначе ставим знак вопроса, пока не прогрузится
						this.expand(val.id,val.url,false,[function(json,st,part){ // Прогружаем категорию
							st[part]=json.count; // Как прогрузится, устанавливаем значение
						},st,val.part]); // Пришлось прибегнуть к функции в качестве аргумента для асинхронности функции после подгрузки категории
					}
				}
				this.select=st; // Выводим пользователю
				this.selected=true;
			}
		}
	});
	window.addEventListener("popstate",Main.forcePage); // Добавляем событие на изменение ссылки через историю
})